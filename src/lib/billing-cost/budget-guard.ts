import { BillingConfigValidationError } from './errors.js'
import type { BudgetGuardDecision, BudgetGuardInput } from './types.js'

function assertNonNegativeFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BillingConfigValidationError(
      `${fieldName} must be a finite non-negative number`,
    )
  }

  return value
}

function assertBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BillingConfigValidationError(`${fieldName} must be a boolean`)
  }

  return value
}

export function evaluateBudgetGuard(input: BudgetGuardInput): BudgetGuardDecision {
  const workspaceActualPlatformBillableUsd = assertNonNegativeFiniteNumber(
    input.workspaceActualPlatformBillableUsd,
    'workspaceActualPlatformBillableUsd',
  )
  const runActualPlatformBillableUsd = assertNonNegativeFiniteNumber(
    input.runActualPlatformBillableUsd,
    'runActualPlatformBillableUsd',
  )
  const nextEstimatedPlatformBillableUsd = assertNonNegativeFiniteNumber(
    input.nextEstimatedPlatformBillableUsd,
    'nextEstimatedPlatformBillableUsd',
  )
  const workspaceHardBudgetUsd = assertNonNegativeFiniteNumber(
    input.workspaceHardBudgetUsd,
    'workspaceHardBudgetUsd',
  )
  const workspaceSoftBudgetUsd = assertNonNegativeFiniteNumber(
    input.workspaceSoftBudgetUsd,
    'workspaceSoftBudgetUsd',
  )
  const runHardBudgetUsd = assertNonNegativeFiniteNumber(
    input.runHardBudgetUsd,
    'runHardBudgetUsd',
  )
  const runSoftBudgetUsd = assertNonNegativeFiniteNumber(
    input.runSoftBudgetUsd,
    'runSoftBudgetUsd',
  )
  const softWarningAlreadyEmitted = assertBoolean(
    input.softWarningAlreadyEmitted,
    'softWarningAlreadyEmitted',
  )

  const projectedWorkspaceSpendUsd =
    workspaceActualPlatformBillableUsd + nextEstimatedPlatformBillableUsd
  const projectedRunSpendUsd = runActualPlatformBillableUsd + nextEstimatedPlatformBillableUsd

  if (projectedRunSpendUsd > runHardBudgetUsd) {
    return {
      decision: 'block_for_budget',
      reason: 'projected spend would exceed the run hard budget',
      blockedLevel: 'run',
    }
  }

  if (projectedWorkspaceSpendUsd > workspaceHardBudgetUsd) {
    return {
      decision: 'block_for_budget',
      reason: 'projected spend would exceed the workspace hard budget',
      blockedLevel: 'workspace',
    }
  }

  if (!softWarningAlreadyEmitted && projectedRunSpendUsd > runSoftBudgetUsd) {
    return {
      decision: 'allow_with_soft_warning',
      reason: 'projected spend crosses the run soft budget for the first time',
      threshold: 'run',
    }
  }

  if (!softWarningAlreadyEmitted && projectedWorkspaceSpendUsd > workspaceSoftBudgetUsd) {
    return {
      decision: 'allow_with_soft_warning',
      reason: 'projected spend crosses the workspace soft budget for the first time',
      threshold: 'workspace',
    }
  }

  return {
    decision: 'allow',
    reason: 'projected spend stays within run and workspace soft budgets',
  }
}
