import {
  BillingConfigValidationError,
  BillingPermissionError,
  BillingWriteContentionError,
} from './errors.js'
import {
  assertOptionalUuid,
  assertUuid,
  type BillingConfigVersionId,
  type RunId,
  type UserId,
  type WorkspaceId,
} from '../ids.js'
import { createModelCostEvent, summarizeSpend as summarizeLedgerSpend } from './ledger.js'
import type {
  BillingConfigVersion,
  ModelCostEvent,
  RunBudgetSnapshot,
  SpendSummary,
  WorkspaceBillingRepository,
} from './types.js'
import { validateWorkspaceBillingConfigDocument } from './validation.js'

export type CreateBillingConfigVersionInput = {
  repository: WorkspaceBillingRepository
  workspaceId: WorkspaceId
  createdByUserId: UserId
  config: unknown
}

export type SnapshotRunBudgetInput = {
  repository: WorkspaceBillingRepository
  workspaceId: WorkspaceId
  runId: RunId
  explicitRunBudget?: {
    runHardBudgetUsd: number
    runSoftBudgetUsd: number
  } | null
}

export type RecordCostEventInput = {
  repository: WorkspaceBillingRepository
  event: Parameters<typeof createModelCostEvent>[0]
}

export type SummarizeSpendInput = {
  repository: WorkspaceBillingRepository
  workspaceId: WorkspaceId
  runId: RunId
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : null
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : ''

  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint')
  )
}

function findCostEventByIdempotencyKey(
  events: ModelCostEvent[],
  runId: string,
  idempotencyKey: string,
): ModelCostEvent | null {
  return (
    events.find(
      (event) => event.runId === runId && event.idempotencyKey === idempotencyKey,
    ) ?? null
  )
}

function assertWorkspaceOwner(
  repository: WorkspaceBillingRepository,
  workspaceId: WorkspaceId,
  userId: UserId,
): Promise<void> {
  return repository.getWorkspaceRole(userId, workspaceId).then((role) => {
    if (role !== 'owner') {
      throw new BillingPermissionError()
    }
  })
}

function createValidationError(message: string): BillingConfigValidationError {
  return new BillingConfigValidationError(message)
}

function assertWorkspaceId(value: unknown, fieldName: string): WorkspaceId {
  return assertUuid<WorkspaceId, BillingConfigValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertRunId(value: unknown, fieldName: string): RunId {
  return assertUuid<RunId, BillingConfigValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertUserId(value: unknown, fieldName: string): UserId {
  return assertUuid<UserId, BillingConfigValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertBillingConfigVersionId(
  value: unknown,
  fieldName: string,
): BillingConfigVersionId | null | undefined {
  return assertOptionalUuid<BillingConfigVersionId, BillingConfigValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertFiniteNonNegativeNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BillingConfigValidationError(
      `${fieldName} must be a finite non-negative number`,
    )
  }

  return value
}

function resolveRunBudget(
  explicitRunBudget:
    | {
        runHardBudgetUsd: number
        runSoftBudgetUsd: number
      }
    | null
    | undefined,
  config: BillingConfigVersion['config'],
): { runHardBudgetUsd: number; runSoftBudgetUsd: number; source: 'explicit' | 'inherited' } {
  if (explicitRunBudget === undefined || explicitRunBudget === null) {
    return {
      runHardBudgetUsd: config.defaultRunHardBudgetUsd,
      runSoftBudgetUsd: config.defaultRunSoftBudgetUsd,
      source: 'inherited',
    }
  }

  const runHardBudgetUsd = assertFiniteNonNegativeNumber(
    explicitRunBudget.runHardBudgetUsd,
    'explicitRunBudget.runHardBudgetUsd',
  )
  const runSoftBudgetUsd = assertFiniteNonNegativeNumber(
    explicitRunBudget.runSoftBudgetUsd,
    'explicitRunBudget.runSoftBudgetUsd',
  )

  if (runSoftBudgetUsd > runHardBudgetUsd) {
    throw new BillingConfigValidationError(
      'explicitRunBudget.runSoftBudgetUsd must be less than or equal to explicitRunBudget.runHardBudgetUsd',
    )
  }

  if (runHardBudgetUsd > config.workspaceHardBudgetUsd) {
    throw new BillingConfigValidationError(
      'explicitRunBudget.runHardBudgetUsd must be less than or equal to workspaceHardBudgetUsd',
    )
  }

  return {
    runHardBudgetUsd,
    runSoftBudgetUsd,
    source: 'explicit',
  }
}

export async function getActiveBillingConfigVersion(
  repository: WorkspaceBillingRepository,
  workspaceId: WorkspaceId,
): Promise<BillingConfigVersion | null> {
  return repository.getLatestBillingConfigVersion(
    assertWorkspaceId(workspaceId, 'workspaceId'),
  )
}

export async function createBillingConfigVersion(
  input: CreateBillingConfigVersionInput,
): Promise<BillingConfigVersion> {
  const workspaceId = assertWorkspaceId(input.workspaceId, 'workspaceId')
  const createdByUserId = assertUserId(input.createdByUserId, 'createdByUserId')
  const validatedConfig = validateWorkspaceBillingConfigDocument(input.config)
  await assertWorkspaceOwner(input.repository, workspaceId, createdByUserId)

  let latestVersion = await input.repository.getLatestBillingConfigVersion(workspaceId)
  const maxAttempts = 5

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await input.repository.insertBillingConfigVersion({
        workspaceId,
        version: latestVersion ? latestVersion.version + 1 : 1,
        config: validatedConfig,
        createdByUserId,
        supersedesBillingConfigVersionId: assertBillingConfigVersionId(
          latestVersion?.billingConfigVersionId ?? null,
          'supersedesBillingConfigVersionId',
        ) ?? null,
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }

      if (attempt === maxAttempts - 1) {
        break
      }

      latestVersion = await input.repository.getLatestBillingConfigVersion(workspaceId)
    }
  }

  throw new BillingWriteContentionError(
    'workspace billing config changed during save; retry',
  )
}

export async function snapshotRunBudget(
  input: SnapshotRunBudgetInput,
): Promise<RunBudgetSnapshot> {
  const workspaceId = assertWorkspaceId(input.workspaceId, 'workspaceId')
  const runId = assertRunId(input.runId, 'runId')
  const existingSnapshot = await input.repository.getRunBudgetSnapshot(
    workspaceId,
    runId,
  )

  if (existingSnapshot !== null) {
    return existingSnapshot
  }

  const activeVersion = await getActiveBillingConfigVersion(
    input.repository,
    workspaceId,
  )

  if (activeVersion === null) {
    throw new BillingConfigValidationError(
      'No active billing config version exists for workspace',
    )
  }

  const budget = resolveRunBudget(
    input.explicitRunBudget,
    activeVersion.config,
  )

  const snapshotInput = {
    workspaceId,
    runId,
    billingConfigVersionId: activeVersion.billingConfigVersionId,
    source: budget.source,
    runHardBudgetUsd: budget.runHardBudgetUsd,
    runSoftBudgetUsd: budget.runSoftBudgetUsd,
  }

  try {
    return await input.repository.insertRunBudgetSnapshot(snapshotInput)
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error
    }

    const concurrentSnapshot = await input.repository.getRunBudgetSnapshot(
      workspaceId,
      runId,
    )

    if (concurrentSnapshot !== null) {
      return concurrentSnapshot
    }

    throw new BillingWriteContentionError()
  }
}

export async function recordCostEvent(
  input: RecordCostEventInput,
): Promise<ModelCostEvent> {
  const validatedEvent = createModelCostEvent(input.event)
  const { costEventId: _costEventId, ...persistedEvent } = validatedEvent

  try {
    return await input.repository.insertCostEvent(persistedEvent)
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error
    }

    const existingEvent = findCostEventByIdempotencyKey(
      await input.repository.listCostEventsForRun(persistedEvent.runId),
      persistedEvent.runId,
      persistedEvent.idempotencyKey,
    )

    if (existingEvent !== null) {
      return existingEvent
    }

    throw error
  }
}

export async function summarizeSpend(
  input: SummarizeSpendInput,
): Promise<SpendSummary> {
  const workspaceId = assertWorkspaceId(input.workspaceId, 'workspaceId')
  const runId = assertRunId(input.runId, 'runId')
  const workspaceEvents = await input.repository.listCostEventsForWorkspace(
    workspaceId,
  )
  const runEvents = workspaceEvents.filter((event) => event.runId === runId)

  const workspaceSummary = summarizeLedgerSpend(workspaceEvents)
  const runSummary = summarizeLedgerSpend(runEvents)

  return {
    ...workspaceSummary,
    byRun: Object.assign(
      Object.create(null),
      workspaceSummary.byRun,
      runSummary.byRun,
    ),
  }
}
