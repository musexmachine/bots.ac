# f-billing-and-cost — Billing and Cost Surface Design

**Date:** 2026-04-16
**Status:** drafted
**Sub-spec:** `docs/specs/f-billing-and-cost.md`
**Phase:** foundation
**Required for MVP:** yes

---

## Context

bots.ac needs budget enforcement before multi-provider routing and cost observability can be trustworthy. This design defines workspace and run budget configuration, model-price resolution, preflight budget checks, and the append-only cost event primitives that later specs can build on.

It is an MVP foundation dependency for `25-model-routing` and `27-observability`.

Source sections in `SPEC.md`: Foundations → "Billing and cost surface"; Model layer; Observability.

---

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Launch posture | Budget-first foundation, not a billing console |
| Enforced boundaries | Workspace and per-run budgets |
| Budget behavior | Warn at soft threshold, stop at hard threshold |
| Comparison unit | USD-normalized cost |
| BYO-key treatment | Visible, but excluded from hard enforcement |
| Accounting model | Append-only post-fact cost events with preflight estimates for the next action |
| Launch billable scope | Model spend only |
| Price source | Provider metadata first, internal fallback catalog second |
| Event granularity | Action-level cost events |
| Preflight check | Actual spend so far plus estimated incremental next-action cost |
| Hard-threshold behavior | Block the next billable action before it runs |
| Workspace budget editor | Workspace owner only |
| Per-run budget source | Explicit run cap or inherited workspace default |
| Inherited run cap | Workspace-configured default run budget |
| Visibility at launch | Operator/log surfaces only |
| Soft-threshold behavior | Emit one warning event and continue |
| Failed attempts | Count when billable |
| Blocked-run state | Distinct terminal `budget-blocked` state |
| Core implementation pattern | Ledger plus centralized budget guard service |

---

## Architecture

`f-billing-and-cost` should be built as four cooperating pieces.

First, a `price resolver` resolves the price for a provider/model/token-type tuple. It prefers provider metadata when a trustworthy price is available. If metadata is missing or incomplete, it falls back to an internal versioned catalog snapshot. Every resolved price must carry provenance so later cost events can record whether the price came from provider metadata or the fallback catalog.

Second, a control-plane `workspace billing config` stores the workspace hard and soft ceilings plus the default per-run hard and soft ceilings. Only the workspace owner may update this config. Runs snapshot their effective budget at start, either from an explicit run cap or from the workspace default.

Third, a centralized `budget guard` sits in front of every billable model action. The runtime asks it to evaluate `actual platform-billable spend so far + estimated next-action cost` against both the run and workspace ceilings. The guard returns:

- `allow`
- `allow_with_soft_warning`
- `block_for_budget`

Fourth, an append-only `cost event ledger` records actual billable outcomes per action after the attempt completes. These events are the accounting source of truth. The guard uses estimates only for control flow, never as the final accounting record.

```
workspace billing config  ──► run budget snapshot
          │                           │
          ▼                           ▼
   price resolver ─────────────► budget guard
          │                           │
          ▼                           ▼
   pricing provenance          allow / warn / block
          │                           │
          └──────────────► cost event ledger
```

This split keeps enforcement deterministic, accounting auditable, and later observability/model-routing work dependent on one consistent foundation instead of provider-specific logic.

---

## Data model

### Workspace billing config

The canonical config document should be explicit and typed:

```typescript
type WorkspaceBillingConfigDocument = {
  workspaceHardBudgetUsd: number
  workspaceSoftBudgetUsd: number
  defaultRunHardBudgetUsd: number
  defaultRunSoftBudgetUsd: number
}
```

Rules:

- all values are non-negative USD amounts
- each soft threshold must be less than or equal to the corresponding hard threshold
- the default run hard budget must be less than or equal to the workspace hard budget
- the default run soft budget must be less than or equal to the default run hard budget

### Run budget snapshot

Each run needs an immutable snapshot of its effective budget:

```typescript
type RunBudgetSnapshot = {
  runId: string
  workspaceId: string
  billingConfigVersionId: string
  source: 'explicit' | 'inherited'
  runHardBudgetUsd: number
  runSoftBudgetUsd: number
}
```

Workspace budget edits after run start do not retroactively change this snapshot.

### Cost event

The launch ledger uses action-level model cost events:

```typescript
type ModelCostEvent = {
  costEventId: string
  workspaceId: string
  runId: string
  agentId: string
  actionId: string
  billableCategory: 'model'
  provider: string
  model: string
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    cachedInputTokens?: number
  }
  estimatedUsd?: number
  actualUsd: number
  currency: 'USD'
  pricingSource: 'provider_metadata' | 'fallback_catalog'
  pricingReference: string
  billableToCustomer: boolean
  isByoKeySpend: boolean
  attemptOutcome: 'succeeded' | 'failed' | 'aborted' | 'rate_limited' | 'timed_out'
  occurredAt: Date
}
```

Corrections, if needed later, should be recorded as additional adjustment events rather than in-place mutation.

### Persistence primitives

This foundation needs three durable tables.

#### `workspace_billing_config_versions`

Immutable workspace billing config versions keyed by `workspace_id` plus monotonic `version`, storing the full config JSON, creator, timestamp, and optional superseded version pointer.

#### `run_budget_snapshots`

One immutable effective-budget row per run, storing `run_id`, `workspace_id`, the source config version, whether the run budget was explicit or inherited, and the resolved hard/soft ceilings.

#### `cost_events`

Append-only action-level model cost events storing run, workspace, agent, provider/model, token usage, actual priced USD, pricing provenance, BYO-key flags, and attempt outcome.

No dedicated dashboard or invoicing tables belong in this foundation.

---

## Interfaces

The billing module should export one pure guard path, one price-resolution path, and a small repository-backed service layer:

```typescript
createDefaultWorkspaceBillingConfig(): WorkspaceBillingConfigDocument
validateWorkspaceBillingConfigDocument(input: unknown): WorkspaceBillingConfigDocument

resolveModelPrice(input: ResolveModelPriceInput): Promise<ResolvedModelPrice>
estimateModelActionUsd(input: EstimateModelActionUsdInput): number
evaluateBudgetGuard(input: BudgetGuardInput): BudgetGuardDecision

createBillingConfigVersion(input: CreateBillingConfigVersionInput): Promise<BillingConfigVersion>
getActiveBillingConfigVersion(workspaceId: string): Promise<BillingConfigVersion | null>
snapshotRunBudget(input: SnapshotRunBudgetInput): Promise<RunBudgetSnapshot>
recordCostEvent(input: RecordCostEventInput): Promise<ModelCostEvent>
summarizeSpend(input: SummarizeSpendInput): Promise<SpendSummary>
```

Key decision shape:

```typescript
type BudgetGuardDecision =
  | { decision: 'allow'; reason: string }
  | { decision: 'allow_with_soft_warning'; reason: string; threshold: 'run' | 'workspace' }
  | { decision: 'block_for_budget'; reason: string; blockedLevel: 'run' | 'workspace' }
```

Missing price resolution should fail closed by returning a blocking decision rather than guessing.

---

## Behavior

### Billing config save

1. Workspace owner submits a new billing config.
2. The service validates shape and numeric constraints before any write.
3. The service verifies the actor is the workspace `owner`.
4. The service inserts a new immutable config version row.
5. The new version becomes active for future runs.

### Run start

1. Runtime resolves the active workspace billing config version.
2. If the run supplies an explicit cap, it must be less than or equal to the workspace hard budget.
3. Otherwise the run inherits the workspace default run budget.
4. The resolved run hard/soft ceilings are snapshotted with the run.

### Preflight budget check

1. Before a billable model action, runtime resolves price data.
2. If provider metadata yields a trustworthy price, use it.
3. Otherwise consult the internal fallback catalog.
4. If neither source resolves a trustworthy price, block the action.
5. Estimate the next-action model cost.
6. Compare `actual platform-billable spend so far + estimate` against both run and workspace ceilings.
7. Return:
   - `allow` when below soft thresholds
   - `allow_with_soft_warning` when crossing a soft threshold for the first time
   - `block_for_budget` when the next action would exceed a hard threshold

### Post-attempt accounting

1. After the model attempt completes, emit an immutable cost event with actual usage and actual USD.
2. If the provider billed the failed attempt, it still records a cost event and counts toward enforced platform-billable spend.
3. If the run used a BYO key, record the event with `isByoKeySpend = true`, but exclude it from hard-budget enforcement.
4. Later rollups by run, agent, and workspace derive from these events, not from mutable counters.

### Budget-blocked runs

When the guard returns `block_for_budget`, the calling runtime must stop that model action and mark the run with the distinct terminal state `budget-blocked`. This foundation defines that contract even though the canonical run-state model belongs to later specs.

---

## Verification

- Invalid billing config documents are rejected at write time
- Explicit run caps above workspace hard budgets are rejected
- Provider metadata pricing wins when available; fallback catalog is used when metadata is missing
- Missing trustworthy price blocks the action
- Soft threshold warns once and does not change execution
- Hard threshold blocks the next billable model action before it runs
- BYO-key spend is recorded but excluded from enforced hard-budget totals
- Billable failed attempts emit cost events and count toward budget
- Cost events remain append-only
- Later rollups by run, agent, and workspace can be derived entirely from the ledger

---

## Out of scope (deferred)

- Compute, storage, egress, and tool-call billing
- End-user billing UI or dashboards
- Invoicing, subscriptions, payment collection, and revenue reporting
- Automatic model fallback or cost-based routing behavior
- Repricing historical events after provider price changes

The main intentional scope cut is that launch enforcement covers model spend only, even though the broader charter names additional billable categories. Those categories should layer onto this foundation later instead of expanding this first draft now.
