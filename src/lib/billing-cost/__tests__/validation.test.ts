import { describe, expect, it } from 'vitest'
import { BillingConfigValidationError } from '../errors.ts'
import {
  createDefaultWorkspaceBillingConfig,
  validateWorkspaceBillingConfigDocument,
} from '../validation.ts'

describe('createDefaultWorkspaceBillingConfig', () => {
  it('returns a valid billing config document', () => {
    const config = createDefaultWorkspaceBillingConfig()

    expect(validateWorkspaceBillingConfigDocument(config)).toEqual(config)
  })
})

describe('validateWorkspaceBillingConfigDocument', () => {
  it('accepts a valid default config', () => {
    expect(
      validateWorkspaceBillingConfigDocument(
        createDefaultWorkspaceBillingConfig(),
      ),
    ).toEqual(createDefaultWorkspaceBillingConfig())
  })

  it('rejects negative values', () => {
    expect(() =>
      validateWorkspaceBillingConfigDocument({
        ...createDefaultWorkspaceBillingConfig(),
        workspaceHardBudgetUsd: -1,
      }),
    ).toThrowError(BillingConfigValidationError)
  })

  it('rejects soft budgets above hard budgets', () => {
    const config = createDefaultWorkspaceBillingConfig()

    expect(() =>
      validateWorkspaceBillingConfigDocument({
        ...config,
        workspaceSoftBudgetUsd: config.workspaceHardBudgetUsd + 1,
      }),
    ).toThrowError('workspaceSoftBudgetUsd must be less than or equal to workspaceHardBudgetUsd')

    expect(() =>
      validateWorkspaceBillingConfigDocument({
        ...config,
        defaultRunSoftBudgetUsd: config.defaultRunHardBudgetUsd + 1,
      }),
    ).toThrowError('defaultRunSoftBudgetUsd must be less than or equal to defaultRunHardBudgetUsd')
  })

  it('rejects default run hard budgets above the workspace hard budget', () => {
    const config = createDefaultWorkspaceBillingConfig()

    expect(() =>
      validateWorkspaceBillingConfigDocument({
        ...config,
        defaultRunHardBudgetUsd: config.workspaceHardBudgetUsd + 1,
      }),
    ).toThrowError(
      'defaultRunHardBudgetUsd must be less than or equal to workspaceHardBudgetUsd',
    )
  })

  it('rejects unknown top-level keys', () => {
    expect(() =>
      validateWorkspaceBillingConfigDocument({
        ...createDefaultWorkspaceBillingConfig(),
        unexpected: true,
      }),
    ).toThrowError(
      'workspace billing config contains unknown field: unexpected',
    )
  })
})
