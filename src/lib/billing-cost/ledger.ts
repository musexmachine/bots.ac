import { assertUuid, createUuid, type CostEventId, type RunId, type WorkspaceId } from '../ids.js'
import { BillingConfigValidationError } from './errors.js'
import type {
  AttemptOutcome,
  ModelCostEvent,
  PricingSource,
  SpendByAgent,
  SpendByRun,
  SpendByWorkspace,
  SpendSummary,
  SpendTotals,
  TokenUsage,
} from './types.js'

export type CreateModelCostEventInput = {
  workspaceId: WorkspaceId
  runId: RunId
  idempotencyKey: string
  agentId: string
  actionId: string
  provider: string
  model: string
  tokenUsage: TokenUsage
  estimatedUsd?: number
  actualUsd: number
  pricingSource: PricingSource
  pricingReference: string
  billableToCustomer: boolean
  isByoKeySpend: boolean
  attemptOutcome: AttemptOutcome
  occurredAt?: Date
}

const PRICING_SOURCES: readonly PricingSource[] = ['provider_metadata', 'fallback_catalog']
const ATTEMPT_OUTCOMES: readonly AttemptOutcome[] = [
  'succeeded',
  'failed',
  'aborted',
  'rate_limited',
  'timed_out',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BillingConfigValidationError(`${fieldName} is required`)
  }

  return value
}

function assertWorkspaceId(value: unknown, fieldName: string): WorkspaceId {
  return assertUuid<WorkspaceId, BillingConfigValidationError>(
    value,
    fieldName,
    (message) => new BillingConfigValidationError(message),
  )
}

function assertRunId(value: unknown, fieldName: string): RunId {
  return assertUuid<RunId, BillingConfigValidationError>(
    value,
    fieldName,
    (message) => new BillingConfigValidationError(message),
  )
}

function assertFiniteNonNegativeNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BillingConfigValidationError(`${fieldName} must be a finite non-negative number`)
  }

  return value
}

function assertFiniteNonNegativeInteger(value: unknown, fieldName: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new BillingConfigValidationError(`${fieldName} must be a finite non-negative integer`)
  }

  return value
}

function assertBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BillingConfigValidationError(`${fieldName} must be a boolean`)
  }

  return value
}

function assertEnumValue<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[],
): T {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    throw new BillingConfigValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`)
  }

  return value as T
}

function assertValidDate(value: unknown, fieldName: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new BillingConfigValidationError(`${fieldName} must be a valid Date`)
  }

  return new Date(value.getTime())
}

function assertTokenUsage(value: unknown): TokenUsage {
  if (!isRecord(value)) {
    throw new BillingConfigValidationError('tokenUsage must be an object')
  }

  const inputTokens = assertFiniteNonNegativeInteger(value.inputTokens, 'inputTokens')
  const outputTokens = assertFiniteNonNegativeInteger(value.outputTokens, 'outputTokens')

  const tokenUsage: TokenUsage = {
    inputTokens,
    outputTokens,
  }

  if (value.cachedInputTokens !== undefined) {
    tokenUsage.cachedInputTokens = assertFiniteNonNegativeInteger(
      value.cachedInputTokens,
      'cachedInputTokens',
    )
  }

  if (
    tokenUsage.cachedInputTokens !== undefined &&
    tokenUsage.cachedInputTokens > tokenUsage.inputTokens
  ) {
    throw new BillingConfigValidationError(
      'cachedInputTokens cannot exceed inputTokens',
    )
  }

  return tokenUsage
}

function isPlatformBillableEvent(event: ModelCostEvent): boolean {
  return event.billableToCustomer && !event.isByoKeySpend
}

function addTotals(
  totalsByKey: Record<string, SpendTotals>,
  key: string,
  event: ModelCostEvent,
): void {
  const totals = totalsByKey[key] ?? { actualUsd: 0, platformBillableUsd: 0 }
  totals.actualUsd += event.actualUsd

  if (isPlatformBillableEvent(event)) {
    totals.platformBillableUsd += event.actualUsd
  }

  totalsByKey[key] = totals
}

function summarizeBy<TKey extends string>(
  events: ModelCostEvent[],
  selectKey: (event: ModelCostEvent) => TKey,
): Partial<Record<TKey, SpendTotals>> {
  return events.reduce<Partial<Record<TKey, SpendTotals>>>((totalsByKey, event) => {
    addTotals(totalsByKey as Record<string, SpendTotals>, selectKey(event), event)
    return totalsByKey
  }, Object.create(null) as Partial<Record<TKey, SpendTotals>>)
}

export function createModelCostEvent(input: CreateModelCostEventInput): ModelCostEvent {
  const workspaceId = assertWorkspaceId(input.workspaceId, 'workspaceId')
  const runId = assertRunId(input.runId, 'runId')
  const idempotencyKey = assertRequiredString(input.idempotencyKey, 'idempotencyKey')
  const agentId = assertRequiredString(input.agentId, 'agentId')
  const actionId = assertRequiredString(input.actionId, 'actionId')
  const provider = assertRequiredString(input.provider, 'provider')
  const model = assertRequiredString(input.model, 'model')
  const tokenUsage = assertTokenUsage(input.tokenUsage)
  const estimatedUsd =
    input.estimatedUsd === undefined
      ? undefined
      : assertFiniteNonNegativeNumber(input.estimatedUsd, 'estimatedUsd')
  const actualUsd = assertFiniteNonNegativeNumber(input.actualUsd, 'actualUsd')
  const pricingSource = assertEnumValue(input.pricingSource, 'pricingSource', PRICING_SOURCES)
  const pricingReference = assertRequiredString(input.pricingReference, 'pricingReference')
  const billableToCustomer = assertBoolean(input.billableToCustomer, 'billableToCustomer')
  const isByoKeySpend = assertBoolean(input.isByoKeySpend, 'isByoKeySpend')
  const attemptOutcome = assertEnumValue(
    input.attemptOutcome,
    'attemptOutcome',
    ATTEMPT_OUTCOMES,
  )
  const occurredAt =
    input.occurredAt === undefined ? new Date() : assertValidDate(input.occurredAt, 'occurredAt')

  return {
    costEventId: createUuid<CostEventId>(),
    workspaceId,
    runId,
    idempotencyKey,
    agentId,
    actionId,
    billableCategory: 'model',
    provider,
    model,
    tokenUsage: { ...tokenUsage },
    estimatedUsd,
    actualUsd,
    currency: 'USD',
    pricingSource,
    pricingReference,
    billableToCustomer,
    isByoKeySpend,
    attemptOutcome,
    occurredAt,
  }
}

export function sumPlatformBillableUsd(events: ModelCostEvent[]): number {
  return events.reduce((total, event) => {
    return isPlatformBillableEvent(event) ? total + event.actualUsd : total
  }, 0)
}

export function summarizeSpend(events: ModelCostEvent[]): SpendSummary {
  const actualUsd = events.reduce((total, event) => total + event.actualUsd, 0)
  const byRun = summarizeBy<RunId>(events, (event) => event.runId)
  const byWorkspace = summarizeBy<WorkspaceId>(events, (event) => event.workspaceId)
  const byAgent = summarizeBy<string>(events, (event) => event.agentId) as SpendByAgent

  return {
    actualUsd,
    platformBillableUsd: sumPlatformBillableUsd(events),
    byRun: byRun as SpendByRun,
    byWorkspace: byWorkspace as SpendByWorkspace,
    byAgent,
  }
}
