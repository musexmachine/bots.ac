import { BillingConfigValidationError } from './errors.js'
import type { WorkspaceBillingConfigDocument } from './types.js'

const WORKSPACE_BILLING_CONFIG_KEYS = [
  'workspaceHardBudgetUsd',
  'workspaceSoftBudgetUsd',
  'defaultRunHardBudgetUsd',
  'defaultRunSoftBudgetUsd',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertKnownKeys(
  input: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: string,
): void {
  const unknownKey = Object.keys(input).find((key) => !allowedKeys.includes(key))

  if (unknownKey !== undefined) {
    throw new BillingConfigValidationError(
      `${context} contains unknown field: ${unknownKey}`,
    )
  }
}

function assertRequiredUsdAmount(
  value: unknown,
  fieldName: string,
): number {
  if (value === undefined) {
    throw new BillingConfigValidationError(`${fieldName} is required`)
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BillingConfigValidationError(
      `${fieldName} must be a finite non-negative number`,
    )
  }

  return value
}

export function createDefaultWorkspaceBillingConfig(): WorkspaceBillingConfigDocument {
  return {
    workspaceHardBudgetUsd: 1000,
    workspaceSoftBudgetUsd: 800,
    defaultRunHardBudgetUsd: 100,
    defaultRunSoftBudgetUsd: 80,
  }
}

export function validateWorkspaceBillingConfigDocument(
  input: unknown,
): WorkspaceBillingConfigDocument {
  if (!isRecord(input)) {
    throw new BillingConfigValidationError(
      'workspace billing config document must be an object',
    )
  }

  assertKnownKeys(input, WORKSPACE_BILLING_CONFIG_KEYS, 'workspace billing config')

  const workspaceHardBudgetUsd = assertRequiredUsdAmount(
    input.workspaceHardBudgetUsd,
    'workspaceHardBudgetUsd',
  )
  const workspaceSoftBudgetUsd = assertRequiredUsdAmount(
    input.workspaceSoftBudgetUsd,
    'workspaceSoftBudgetUsd',
  )
  const defaultRunHardBudgetUsd = assertRequiredUsdAmount(
    input.defaultRunHardBudgetUsd,
    'defaultRunHardBudgetUsd',
  )
  const defaultRunSoftBudgetUsd = assertRequiredUsdAmount(
    input.defaultRunSoftBudgetUsd,
    'defaultRunSoftBudgetUsd',
  )

  if (workspaceSoftBudgetUsd > workspaceHardBudgetUsd) {
    throw new BillingConfigValidationError(
      'workspaceSoftBudgetUsd must be less than or equal to workspaceHardBudgetUsd',
    )
  }

  if (defaultRunSoftBudgetUsd > defaultRunHardBudgetUsd) {
    throw new BillingConfigValidationError(
      'defaultRunSoftBudgetUsd must be less than or equal to defaultRunHardBudgetUsd',
    )
  }

  if (defaultRunHardBudgetUsd > workspaceHardBudgetUsd) {
    throw new BillingConfigValidationError(
      'defaultRunHardBudgetUsd must be less than or equal to workspaceHardBudgetUsd',
    )
  }

  return {
    workspaceHardBudgetUsd,
    workspaceSoftBudgetUsd,
    defaultRunHardBudgetUsd,
    defaultRunSoftBudgetUsd,
  }
}
