import { describe, expect, it } from 'vitest'
import { BillingConfigValidationError } from '../errors.js'
import { evaluateBudgetGuard } from '../budget-guard.js'

describe('evaluateBudgetGuard', () => {
  it('allows when projected spend stays below soft thresholds', () => {
    expect(
      evaluateBudgetGuard({
        workspaceActualPlatformBillableUsd: 40,
        runActualPlatformBillableUsd: 20,
        nextEstimatedPlatformBillableUsd: 10,
        workspaceHardBudgetUsd: 200,
        workspaceSoftBudgetUsd: 160,
        runHardBudgetUsd: 100,
        runSoftBudgetUsd: 80,
        softWarningAlreadyEmitted: false,
      }),
    ).toEqual({
      decision: 'allow',
      reason: 'projected spend stays within run and workspace soft budgets',
    })
  })

  it('warns once when projected spend crosses the run soft threshold', () => {
    expect(
      evaluateBudgetGuard({
        workspaceActualPlatformBillableUsd: 40,
        runActualPlatformBillableUsd: 70,
        nextEstimatedPlatformBillableUsd: 20,
        workspaceHardBudgetUsd: 200,
        workspaceSoftBudgetUsd: 160,
        runHardBudgetUsd: 100,
        runSoftBudgetUsd: 80,
        softWarningAlreadyEmitted: false,
      }),
    ).toEqual({
      decision: 'allow_with_soft_warning',
      reason: 'projected spend crosses the run soft budget for the first time',
      threshold: 'run',
    })
  })

  it('warns once when projected spend crosses the workspace soft threshold', () => {
    expect(
      evaluateBudgetGuard({
        workspaceActualPlatformBillableUsd: 70,
        runActualPlatformBillableUsd: 20,
        nextEstimatedPlatformBillableUsd: 20,
        workspaceHardBudgetUsd: 200,
        workspaceSoftBudgetUsd: 80,
        runHardBudgetUsd: 100,
        runSoftBudgetUsd: 80,
        softWarningAlreadyEmitted: false,
      }),
    ).toEqual({
      decision: 'allow_with_soft_warning',
      reason: 'projected spend crosses the workspace soft budget for the first time',
      threshold: 'workspace',
    })
  })

  it('blocks when projected spend would exceed the run hard budget', () => {
    expect(
      evaluateBudgetGuard({
        workspaceActualPlatformBillableUsd: 50,
        runActualPlatformBillableUsd: 90,
        nextEstimatedPlatformBillableUsd: 20,
        workspaceHardBudgetUsd: 200,
        workspaceSoftBudgetUsd: 160,
        runHardBudgetUsd: 100,
        runSoftBudgetUsd: 80,
        softWarningAlreadyEmitted: false,
      }),
    ).toEqual({
      decision: 'block_for_budget',
      reason: 'projected spend would exceed the run hard budget',
      blockedLevel: 'run',
    })
  })

  it('blocks when projected spend would exceed the workspace hard budget', () => {
    expect(
      evaluateBudgetGuard({
        workspaceActualPlatformBillableUsd: 90,
        runActualPlatformBillableUsd: 50,
        nextEstimatedPlatformBillableUsd: 20,
        workspaceHardBudgetUsd: 100,
        workspaceSoftBudgetUsd: 80,
        runHardBudgetUsd: 200,
        runSoftBudgetUsd: 160,
        softWarningAlreadyEmitted: false,
      }),
    ).toEqual({
      decision: 'block_for_budget',
      reason: 'projected spend would exceed the workspace hard budget',
      blockedLevel: 'workspace',
    })
  })

  it('does not count a non-platform-billable next action toward hard-stop enforcement', () => {
    expect(
      evaluateBudgetGuard({
        workspaceActualPlatformBillableUsd: 100,
        runActualPlatformBillableUsd: 100,
        nextEstimatedPlatformBillableUsd: 0,
        workspaceHardBudgetUsd: 100,
        workspaceSoftBudgetUsd: 100,
        runHardBudgetUsd: 100,
        runSoftBudgetUsd: 100,
        softWarningAlreadyEmitted: false,
      }),
    ).toEqual({
      decision: 'allow',
      reason: 'projected spend stays within run and workspace soft budgets',
    })
  })

  it('rejects negative inputs with a billing config validation error', () => {
    expect(() =>
      evaluateBudgetGuard({
        workspaceActualPlatformBillableUsd: -1,
        runActualPlatformBillableUsd: 10,
        nextEstimatedPlatformBillableUsd: 0,
        workspaceHardBudgetUsd: 100,
        workspaceSoftBudgetUsd: 80,
        runHardBudgetUsd: 50,
        runSoftBudgetUsd: 40,
        softWarningAlreadyEmitted: false,
      }),
    ).toThrowError(BillingConfigValidationError)
  })
})
