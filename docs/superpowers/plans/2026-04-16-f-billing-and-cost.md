# f-billing-and-cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the budget-first billing foundation for model spend: immutable workspace billing configs, run budget snapshots, price resolution with fallback catalog, preflight budget guard decisions, and append-only action-level cost events.

**Architecture:** Keep pricing resolution, budget evaluation, and ledger math pure TypeScript. Use PostgreSQL only for immutable config versions, run budget snapshots, and append-only cost events. A small service layer orchestrates owner checks, version increments, run-budget inheritance, and repository-backed spend summaries. Runtime source files should use NodeNext-style `.js` import specifiers.

**Tech Stack:** TypeScript, PostgreSQL SQL migrations, Vitest, Node.js 20+. No new runtime dependencies.

**Design doc:** `docs/superpowers/specs/2026-04-16-f-billing-and-cost-design.md`

---

## File Structure

```text
src/
  lib/
    billing-cost/
      index.ts
      types.ts
      errors.ts
      validation.ts
      fallback-catalog.ts
      pricing.ts
      budget-guard.ts
      ledger.ts
      service.ts
      __tests__/
        errors.test.ts
        validation.test.ts
        pricing.test.ts
        budget-guard.test.ts
        ledger.test.ts
        service.test.ts
db/
  migrations/
    0003_billing_cost.sql
```

---

## Task 1: Add DB primitives for billing config versions, run budget snapshots, and cost events

**Files:**
- Create: `db/migrations/0003_billing_cost.sql`

- [ ] **Step 1: Write `db/migrations/0003_billing_cost.sql`**

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS workspace_billing_config_versions (
  billing_config_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  config_json JSONB NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_billing_config_version_id UUID,
  UNIQUE (workspace_id, version),
  UNIQUE (workspace_id, billing_config_version_id),
  FOREIGN KEY (workspace_id, supersedes_billing_config_version_id)
    REFERENCES workspace_billing_config_versions (workspace_id, billing_config_version_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_workspace_billing_config_versions_workspace_created_at
  ON workspace_billing_config_versions (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS run_budget_snapshots (
  run_budget_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL UNIQUE,
  billing_config_version_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('explicit', 'inherited')),
  run_hard_budget_usd NUMERIC(14, 6) NOT NULL CHECK (run_hard_budget_usd >= 0),
  run_soft_budget_usd NUMERIC(14, 6) NOT NULL CHECK (run_soft_budget_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (run_soft_budget_usd <= run_hard_budget_usd),
  FOREIGN KEY (workspace_id, billing_config_version_id)
    REFERENCES workspace_billing_config_versions (workspace_id, billing_config_version_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_run_budget_snapshots_workspace_created_at
  ON run_budget_snapshots (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cost_events (
  cost_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  billable_category TEXT NOT NULL CHECK (billable_category = 'model'),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  token_usage_json JSONB NOT NULL,
  pricing_source TEXT NOT NULL CHECK (pricing_source IN ('provider_metadata', 'fallback_catalog')),
  pricing_reference TEXT NOT NULL,
  estimated_usd NUMERIC(14, 6) CHECK (estimated_usd IS NULL OR estimated_usd >= 0),
  actual_usd NUMERIC(14, 6) NOT NULL CHECK (actual_usd >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  billable_to_customer BOOLEAN NOT NULL,
  is_byo_key_spend BOOLEAN NOT NULL,
  attempt_outcome TEXT NOT NULL CHECK (attempt_outcome IN ('succeeded', 'failed', 'aborted', 'rate_limited', 'timed_out')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_events_run_occurred_at
  ON cost_events (run_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_events_workspace_occurred_at
  ON cost_events (workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_events_agent_occurred_at
  ON cost_events (agent_id, occurred_at DESC);

COMMIT;
```

- [ ] **Step 2: Verify the migration contains the expected tables**

Run:

```bash
rg -n "workspace_billing_config_versions|run_budget_snapshots|cost_events" db/migrations/0003_billing_cost.sql
```

Expected: the command returns the three `CREATE TABLE` lines plus related FK/index references.

- [ ] **Step 3: Apply the migration if your local DB is configured**

Run:

```bash
npx supabase db push
```

Expected: migration applies cleanly. If the CLI is not configured, note that and continue.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0003_billing_cost.sql
git commit -m "feat: add billing and cost DB primitives"
```

---

## Task 2: Define types and error classes

**Files:**
- Create: `src/lib/billing-cost/types.ts`
- Create: `src/lib/billing-cost/errors.ts`
- Create: `src/lib/billing-cost/__tests__/errors.test.ts`

- [ ] **Step 1: Write the failing error test**

Create `src/lib/billing-cost/__tests__/errors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  BillingConfigValidationError,
  BillingPermissionError,
  PriceResolutionError,
} from '../errors.ts'

describe('billing errors', () => {
  it('exposes stable status codes and names', () => {
    expect(new BillingConfigValidationError('bad config').statusCode).toBe(400)
    expect(new BillingPermissionError('owner only').statusCode).toBe(403)
    expect(new PriceResolutionError('missing price').statusCode).toBe(422)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/billing-cost/__tests__/errors.test.ts
```

Expected: FAIL with `Cannot find module '../errors.ts'`.

- [ ] **Step 3: Write `src/lib/billing-cost/errors.ts`**

```typescript
export class BillingConfigValidationError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'BillingConfigValidationError'
  }
}

export class BillingPermissionError extends Error {
  readonly statusCode = 403

  constructor(message = 'Only workspace owners may edit billing config') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'BillingPermissionError'
  }
}

export class PriceResolutionError extends Error {
  readonly statusCode = 422

  constructor(message = 'Unable to resolve a trustworthy model price') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'PriceResolutionError'
  }
}
```

- [ ] **Step 4: Write `src/lib/billing-cost/types.ts`**

Include:

```typescript
export type WorkspaceBillingConfigDocument = {
  workspaceHardBudgetUsd: number
  workspaceSoftBudgetUsd: number
  defaultRunHardBudgetUsd: number
  defaultRunSoftBudgetUsd: number
}

export type BillingConfigVersion = {
  billingConfigVersionId: string
  workspaceId: string
  version: number
  config: WorkspaceBillingConfigDocument
  createdByUserId: string
  createdAt: Date
  supersedesBillingConfigVersionId: string | null
}

export type RunBudgetSnapshot = {
  runBudgetSnapshotId: string
  workspaceId: string
  runId: string
  billingConfigVersionId: string
  source: 'explicit' | 'inherited'
  runHardBudgetUsd: number
  runSoftBudgetUsd: number
  createdAt: Date
}

export type PricingSource = 'provider_metadata' | 'fallback_catalog'
export type AttemptOutcome = 'succeeded' | 'failed' | 'aborted' | 'rate_limited' | 'timed_out'

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
}

export type ModelCostEvent = {
  costEventId: string
  workspaceId: string
  runId: string
  agentId: string
  actionId: string
  billableCategory: 'model'
  provider: string
  model: string
  tokenUsage: TokenUsage
  estimatedUsd?: number
  actualUsd: number
  currency: 'USD'
  pricingSource: PricingSource
  pricingReference: string
  billableToCustomer: boolean
  isByoKeySpend: boolean
  attemptOutcome: AttemptOutcome
  occurredAt: Date
}

export type ResolvedModelPrice = {
  provider: string
  model: string
  pricingSource: PricingSource
  pricingReference: string
  inputUsdPer1kTokens: number
  outputUsdPer1kTokens: number
  cachedInputUsdPer1kTokens?: number
}
```

Also define `BudgetGuardInput`, `BudgetGuardDecision`, `SpendSummary`, `WorkspaceRole`, and `WorkspaceBillingRepository`.

- [ ] **Step 5: Run the targeted test to green**

```bash
npx vitest run src/lib/billing-cost/__tests__/errors.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing-cost/types.ts src/lib/billing-cost/errors.ts src/lib/billing-cost/__tests__/errors.test.ts
git commit -m "feat: add billing and cost types"
```

---

## Task 3: Implement billing-config validation and defaults

**Files:**
- Create: `src/lib/billing-cost/validation.ts`
- Create: `src/lib/billing-cost/__tests__/validation.test.ts`

- [ ] **Step 1: Write the failing validation test**

Cover:

- valid default config
- negative USD values rejected
- soft thresholds above hard thresholds rejected
- default run hard budget above workspace hard budget rejected
- unknown keys rejected at the top level

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/billing-cost/__tests__/validation.test.ts
```

- [ ] **Step 3: Write `src/lib/billing-cost/validation.ts`**

Implement:

```typescript
createDefaultWorkspaceBillingConfig(): WorkspaceBillingConfigDocument
validateWorkspaceBillingConfigDocument(input: unknown): WorkspaceBillingConfigDocument
```

Validation rules:

- all fields required
- all fields finite numbers >= 0
- `workspaceSoftBudgetUsd <= workspaceHardBudgetUsd`
- `defaultRunSoftBudgetUsd <= defaultRunHardBudgetUsd`
- `defaultRunHardBudgetUsd <= workspaceHardBudgetUsd`
- reject unknown keys instead of silently dropping them

- [ ] **Step 4: Re-run the targeted tests**

```bash
npx vitest run src/lib/billing-cost/__tests__/validation.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing-cost/validation.ts src/lib/billing-cost/__tests__/validation.test.ts
git commit -m "feat: validate workspace billing config"
```

---

## Task 4: Implement fallback catalog, price resolution, and cost estimation

**Files:**
- Create: `src/lib/billing-cost/fallback-catalog.ts`
- Create: `src/lib/billing-cost/pricing.ts`
- Create: `src/lib/billing-cost/__tests__/pricing.test.ts`

- [ ] **Step 1: Write the failing pricing tests**

Cover:

- provider metadata price wins when available
- fallback catalog is used when provider metadata is missing
- missing metadata plus missing fallback throws `PriceResolutionError`
- estimated USD uses input/output/cached token rates correctly

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/lib/billing-cost/__tests__/pricing.test.ts
```

- [ ] **Step 3: Write `src/lib/billing-cost/fallback-catalog.ts`**

Export a small in-code catalog snapshot with an explicit version string:

```typescript
export const FALLBACK_PRICE_CATALOG_VERSION = '2026-04-16'
export const FALLBACK_MODEL_PRICES = {
  openai: {
    'gpt-5-mini': {
      inputUsdPer1kTokens: 0.001,
      outputUsdPer1kTokens: 0.004,
    },
  },
} as const
```

- [ ] **Step 4: Write `src/lib/billing-cost/pricing.ts`**

Implement:

```typescript
resolveModelPrice(input: ResolveModelPriceInput): Promise<ResolvedModelPrice>
estimateModelActionUsd(input: EstimateModelActionUsdInput): number
```

Where `ResolveModelPriceInput` accepts provider/model plus an optional metadata resolver callback. Use provider metadata first, then fallback catalog, and throw `PriceResolutionError` if neither source can produce a trustworthy price.

- [ ] **Step 5: Re-run the targeted tests**

```bash
npx vitest run src/lib/billing-cost/__tests__/pricing.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing-cost/fallback-catalog.ts src/lib/billing-cost/pricing.ts src/lib/billing-cost/__tests__/pricing.test.ts
git commit -m "feat: add model price resolution"
```

---

## Task 5: Implement the pure budget guard

**Files:**
- Create: `src/lib/billing-cost/budget-guard.ts`
- Create: `src/lib/billing-cost/__tests__/budget-guard.test.ts`

- [ ] **Step 1: Write the failing budget-guard tests**

Cover:

- allow below soft thresholds
- `allow_with_soft_warning` when projected spend crosses run soft threshold for the first time
- `allow_with_soft_warning` when projected spend crosses workspace soft threshold for the first time
- `block_for_budget` when projected spend would exceed run hard budget
- `block_for_budget` when projected spend would exceed workspace hard budget
- BYO-key/non-platform-billable next action does not contribute to the hard-stop comparison

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/lib/billing-cost/__tests__/budget-guard.test.ts
```

- [ ] **Step 3: Write `src/lib/billing-cost/budget-guard.ts`**

Implement:

```typescript
evaluateBudgetGuard(input: BudgetGuardInput): BudgetGuardDecision
```

Use:

- `workspaceActualPlatformBillableUsd`
- `runActualPlatformBillableUsd`
- `nextEstimatedPlatformBillableUsd`
- `workspaceHardBudgetUsd`
- `workspaceSoftBudgetUsd`
- `runHardBudgetUsd`
- `runSoftBudgetUsd`
- `softWarningAlreadyEmitted`

Reject negative inputs with `BillingConfigValidationError` rather than normalizing them.

- [ ] **Step 4: Re-run the targeted tests**

```bash
npx vitest run src/lib/billing-cost/__tests__/budget-guard.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing-cost/budget-guard.ts src/lib/billing-cost/__tests__/budget-guard.test.ts
git commit -m "feat: add budget guard decisions"
```

---

## Task 6: Implement the append-only ledger helpers

**Files:**
- Create: `src/lib/billing-cost/ledger.ts`
- Create: `src/lib/billing-cost/__tests__/ledger.test.ts`

- [ ] **Step 1: Write the failing ledger tests**

Cover:

- cost event creation preserves pricing provenance
- spend rollup by run excludes BYO-key spend from platform-billable totals
- spend rollup by workspace/agent is derived from events, not mutable counters
- billable failed attempts still count

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/lib/billing-cost/__tests__/ledger.test.ts
```

- [ ] **Step 3: Write `src/lib/billing-cost/ledger.ts`**

Implement pure helpers like:

```typescript
createModelCostEvent(input: CreateModelCostEventInput): ModelCostEvent
sumPlatformBillableUsd(events: ModelCostEvent[]): number
summarizeSpend(events: ModelCostEvent[]): SpendSummary
```

Keep the ledger append-only: no in-place mutation APIs.

- [ ] **Step 4: Re-run the targeted tests**

```bash
npx vitest run src/lib/billing-cost/__tests__/ledger.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing-cost/ledger.ts src/lib/billing-cost/__tests__/ledger.test.ts
git commit -m "feat: add billing cost ledger helpers"
```

---

## Task 7: Implement the repository-backed service layer

**Files:**
- Create: `src/lib/billing-cost/service.ts`
- Create: `src/lib/billing-cost/__tests__/service.test.ts`

- [ ] **Step 1: Write the failing service tests**

Cover:

- only workspace owner can create billing config versions
- config version increments per workspace
- explicit run budgets above workspace hard budget are rejected
- inherited run budget snapshots use workspace defaults
- explicit run budgets snapshot correctly
- cost event recording persists append-only events
- service-level spend summary returns run/workspace totals needed by the guard

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/lib/billing-cost/__tests__/service.test.ts
```

- [ ] **Step 3: Write `src/lib/billing-cost/service.ts`**

Implement:

```typescript
getActiveBillingConfigVersion(repository, workspaceId): Promise<BillingConfigVersion | null>
createBillingConfigVersion(input): Promise<BillingConfigVersion>
snapshotRunBudget(input): Promise<RunBudgetSnapshot>
recordCostEvent(input): Promise<ModelCostEvent>
summarizeSpend(input): Promise<SpendSummary>
```

Repository responsibilities should stay narrow:

- `getWorkspaceRole`
- `getLatestBillingConfigVersion`
- `insertBillingConfigVersion`
- `insertRunBudgetSnapshot`
- `insertCostEvent`
- `listCostEventsForRun`
- `listCostEventsForWorkspace`

Like the existing workspace-policy module, keep service orchestration separate from pure validation/evaluation logic.

- [ ] **Step 4: Re-run the targeted tests**

```bash
npx vitest run src/lib/billing-cost/__tests__/service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing-cost/service.ts src/lib/billing-cost/__tests__/service.test.ts
git commit -m "feat: add billing cost services"
```

---

## Task 8: Export the module and run full verification

**Files:**
- Create: `src/lib/billing-cost/index.ts`

- [ ] **Step 1: Write `src/lib/billing-cost/index.ts`**

Use NodeNext-style re-exports:

```typescript
export * from './types.js'
export * from './errors.js'
export * from './validation.js'
export * from './fallback-catalog.js'
export * from './pricing.js'
export * from './budget-guard.js'
export * from './ledger.js'
export * from './service.js'
```

- [ ] **Step 2: Run the focused billing-cost test suite**

```bash
npx vitest run \
  src/lib/billing-cost/__tests__/errors.test.ts \
  src/lib/billing-cost/__tests__/validation.test.ts \
  src/lib/billing-cost/__tests__/pricing.test.ts \
  src/lib/billing-cost/__tests__/budget-guard.test.ts \
  src/lib/billing-cost/__tests__/ledger.test.ts \
  src/lib/billing-cost/__tests__/service.test.ts
```

Expected: all files pass.

- [ ] **Step 3: Run the repo test suite**

```bash
npm test
```

Expected: existing identity/workspace-policy tests still pass.

- [ ] **Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing-cost/index.ts src/lib/billing-cost
git commit -m "feat: export billing cost foundation"
```

---

## Acceptance checklist

- [ ] Workspace billing config is immutable and owner-managed
- [ ] Run budgets are explicit or inherited snapshots
- [ ] Model price resolution uses provider metadata first and fallback catalog second
- [ ] Missing price blocks the next billable action
- [ ] Soft threshold warns once and continues
- [ ] Hard threshold blocks the next model action before execution
- [ ] BYO-key spend is visible but excluded from enforced hard-budget totals
- [ ] Billable failed attempts emit append-only cost events and count toward budget
- [ ] Operator/log surfaces can derive run, agent, and workspace cost summaries from the ledger
