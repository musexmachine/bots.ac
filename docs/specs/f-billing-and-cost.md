# f-billing-and-cost — Billing and cost surface

**Status:** drafted
**Phase:** foundation
**Depends on:** —
**Required for MVP:** yes

## Context

Defines the launch budget-enforcement foundation for model spend: workspace and run ceilings, price resolution with fallback catalog, action-level cost events, and BYO-key visibility. This is the accounting and budget-control layer that later model-routing and observability specs build on. Derived from `SPEC.md` → Foundations → "Billing and cost surface", Model layer, and Observability.

Full design: `docs/superpowers/specs/2026-04-16-f-billing-and-cost-design.md`

## Scope

**In:**
- Workspace-level and per-run soft/hard budget ceilings
- USD-normalized budget comparisons for platform-billable model spend
- Provider-metadata-first price resolution with internal fallback catalog
- Append-only action-level model cost events with pricing provenance
- BYO-key visibility, recorded separately from enforced platform-billable totals
- Owner-only workspace billing config edits
- Distinct `budget-blocked` run-stop contract for downstream runtimes

**Out:**
- Compute, storage, egress, and tool-call billing
- Billing dashboards or end-user billing UI
- Invoicing, subscriptions, and payment collection
- Automatic cheaper-model fallback behavior
- Historical repricing

## Interfaces

```typescript
createBillingConfigVersion(input: CreateBillingConfigVersionInput): Promise<BillingConfigVersion>
getActiveBillingConfigVersion(workspaceId: string): Promise<BillingConfigVersion | null>
snapshotRunBudget(input: SnapshotRunBudgetInput): Promise<RunBudgetSnapshot>
resolveModelPrice(input: ResolveModelPriceInput): Promise<ResolvedModelPrice>
evaluateBudgetGuard(input: BudgetGuardInput): BudgetGuardDecision
recordCostEvent(input: RecordCostEventInput): Promise<ModelCostEvent>
summarizeSpend(input: SummarizeSpendInput): Promise<SpendSummary>
```

Decision outcomes: `allow`, `allow_with_soft_warning`, `block_for_budget`.

## Data model

**`workspace_billing_config_versions`:** immutable workspace billing config versions keyed by `workspace_id` + incrementing `version`, storing the full config JSON, creator, timestamp, and optional superseded version pointer.

**`run_budget_snapshots`:** one immutable effective-budget row per run, storing `run_id`, `workspace_id`, source billing config version, whether the run budget was explicit or inherited, and the resolved hard/soft ceilings.

**`cost_events`:** append-only action-level model cost events storing run/workspace/agent identity, provider/model, token usage, actual USD, pricing source/reference, BYO-key flags, and attempt outcome.

## Behavior

1. Workspace owner saves an immutable billing config version.
2. Each run snapshots its effective run budget at start, either explicit or inherited from workspace defaults.
3. Before each billable model action, the budget guard compares `actual platform-billable spend so far + estimated next-action cost` against run and workspace ceilings.
4. Crossing a soft threshold emits one warning and continues.
5. Exceeding a hard threshold blocks that next model action before it runs.
6. After a billable attempt, the runtime emits an immutable cost event with actual usage, actual USD, and pricing provenance.
7. BYO-key spend is recorded for visibility but excluded from the enforced hard-budget comparison.

## Open questions

None that block `drafted` status. This foundation is intentionally narrower than the full charter and may split later when non-model billable categories are introduced.

## Verification

- Invalid billing configs are rejected at write time
- Explicit run budgets above workspace hard budgets are rejected
- Provider metadata price wins when available; fallback catalog is used when needed
- Missing trustworthy price blocks the action
- Soft threshold warns once and continues
- Hard threshold blocks the next billable model action
- Billable failed attempts count
- Cost events remain append-only

## Out of scope (deferred)

- Compute, storage, egress, and tool-call billing
- Billing dashboards and end-user billing UI
- Invoicing, subscriptions, and payment collection
- Automatic lower-cost fallback behavior in model routing
