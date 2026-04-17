import type {
  BillingConfigVersionId,
  CostEventId,
  RunBudgetSnapshotId,
  RunId,
  UserId,
  WorkspaceId,
} from '../ids.js'

export type WorkspaceBillingConfigDocument = {
  workspaceHardBudgetUsd: number
  workspaceSoftBudgetUsd: number
  defaultRunHardBudgetUsd: number
  defaultRunSoftBudgetUsd: number
}

export type BillingConfigVersion = {
  billingConfigVersionId: BillingConfigVersionId
  workspaceId: WorkspaceId
  version: number
  config: WorkspaceBillingConfigDocument
  createdByUserId: UserId
  createdAt: Date
  supersedesBillingConfigVersionId: BillingConfigVersionId | null
}

export type RunBudgetSnapshot = {
  runBudgetSnapshotId: RunBudgetSnapshotId
  workspaceId: WorkspaceId
  runId: RunId
  billingConfigVersionId: BillingConfigVersionId
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
  costEventId: CostEventId
  workspaceId: WorkspaceId
  runId: RunId
  idempotencyKey: string
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

export type BudgetGuardInput = {
  workspaceActualPlatformBillableUsd: number
  runActualPlatformBillableUsd: number
  nextEstimatedPlatformBillableUsd: number
  workspaceHardBudgetUsd: number
  workspaceSoftBudgetUsd: number
  runHardBudgetUsd: number
  runSoftBudgetUsd: number
  softWarningAlreadyEmitted: boolean
}

export type BudgetGuardDecision =
  | { decision: 'allow'; reason: string }
  | { decision: 'allow_with_soft_warning'; reason: string; threshold: 'run' | 'workspace' }
  | { decision: 'block_for_budget'; reason: string; blockedLevel: 'run' | 'workspace' }

export type SpendTotals = {
  actualUsd: number
  platformBillableUsd: number
}

export type SpendByRun = Partial<Record<RunId, SpendTotals>>
export type SpendByWorkspace = Partial<Record<WorkspaceId, SpendTotals>>
export type SpendByAgent = Record<string, SpendTotals>

export type SpendSummary = {
  actualUsd: number
  platformBillableUsd: number
  byRun: SpendByRun
  byWorkspace: SpendByWorkspace
  byAgent: SpendByAgent
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export type WorkspaceBillingRepository = {
  getWorkspaceRole(userId: UserId, workspaceId: WorkspaceId): Promise<WorkspaceRole | null>
  getLatestBillingConfigVersion(workspaceId: WorkspaceId): Promise<BillingConfigVersion | null>
  getRunBudgetSnapshot(
    workspaceId: WorkspaceId,
    runId: RunId,
  ): Promise<RunBudgetSnapshot | null>
  insertBillingConfigVersion(
    input: Omit<BillingConfigVersion, 'billingConfigVersionId' | 'createdAt'>,
  ): Promise<BillingConfigVersion>
  insertRunBudgetSnapshot(
    input: Omit<RunBudgetSnapshot, 'runBudgetSnapshotId' | 'createdAt'>,
  ): Promise<RunBudgetSnapshot>
  insertCostEvent(
    input: Omit<ModelCostEvent, 'costEventId'>,
  ): Promise<ModelCostEvent>
  listCostEventsForRun(runId: RunId): Promise<ModelCostEvent[]>
  listCostEventsForWorkspace(workspaceId: WorkspaceId): Promise<ModelCostEvent[]>
}
