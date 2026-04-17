import { describe, expect, it } from 'vitest'
import { testUuid } from '../../__tests__/helpers/ids.ts'
import { BillingConfigValidationError } from '../errors.ts'
import { createModelCostEvent, sumPlatformBillableUsd, summarizeSpend } from '../ledger.js'

const WORKSPACE_A = testUuid(1)
const WORKSPACE_B = testUuid(2)
const RUN_A = testUuid(3)
const RUN_B = testUuid(4)

describe('createModelCostEvent', () => {
  it('preserves pricing provenance on the appended event', () => {
    const occurredAt = new Date('2026-04-16T12:34:56.000Z')

    const event = createModelCostEvent({
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      idempotencyKey: 'event-a',
      agentId: 'agent-a',
      actionId: 'action-a',
      provider: 'openai',
      model: 'gpt-5-mini',
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 250,
        cachedInputTokens: 100,
      },
      estimatedUsd: 0.012,
      actualUsd: 0.014,
      pricingSource: 'fallback_catalog',
      pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
      billableToCustomer: true,
      isByoKeySpend: false,
      attemptOutcome: 'succeeded',
      occurredAt,
    })

    expect(event).toMatchObject({
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      idempotencyKey: 'event-a',
      agentId: 'agent-a',
      actionId: 'action-a',
      billableCategory: 'model',
      provider: 'openai',
      model: 'gpt-5-mini',
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 250,
        cachedInputTokens: 100,
      },
      estimatedUsd: 0.012,
      actualUsd: 0.014,
      currency: 'USD',
      pricingSource: 'fallback_catalog',
      pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
      billableToCustomer: true,
      isByoKeySpend: false,
      attemptOutcome: 'succeeded',
      occurredAt,
    })

    expect(typeof event.costEventId).toBe('string')
    expect(event.costEventId).not.toHaveLength(0)
  })

  it('rejects malformed event payloads', () => {
    const baseInput = {
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      idempotencyKey: 'event-a',
      agentId: 'agent-a',
      actionId: 'action-a',
      provider: 'openai',
      model: 'gpt-5-mini',
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 250,
        cachedInputTokens: 100,
      },
      estimatedUsd: 0.012,
      actualUsd: 0.014,
      pricingSource: 'fallback_catalog' as const,
      pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
      billableToCustomer: true,
      isByoKeySpend: false,
      attemptOutcome: 'succeeded' as const,
      occurredAt: new Date('2026-04-16T12:34:56.000Z'),
    }

    const malformedInputs = [
      { workspaceId: 'workspace-a' },
      { runId: 'run-a' },
      { provider: '   ' },
      { tokenUsage: { inputTokens: 1.5, outputTokens: 1 } },
      { tokenUsage: { inputTokens: 1, outputTokens: -1 } },
      { tokenUsage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 2 } },
      { actualUsd: Number.NaN },
      { estimatedUsd: Number.POSITIVE_INFINITY },
      { pricingSource: 'manual_override' },
      { attemptOutcome: 'queued' },
      { pricingReference: '' },
      { idempotencyKey: '' },
      { billableToCustomer: 'yes' },
      { isByoKeySpend: 1 },
      { occurredAt: new Date('not-a-date') },
    ]

    for (const overrides of malformedInputs) {
      expect(() =>
        createModelCostEvent({
          ...baseInput,
          ...(overrides as Partial<typeof baseInput>),
        }),
      ).toThrowError(BillingConfigValidationError)
    }
  })

  it('clones the occurredAt timestamp instead of retaining caller-owned state', () => {
    const occurredAt = new Date('2026-04-16T12:34:56.000Z')

    const event = createModelCostEvent({
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      idempotencyKey: 'event-a',
      agentId: 'agent-a',
      actionId: 'action-a',
      provider: 'openai',
      model: 'gpt-5-mini',
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 250,
        cachedInputTokens: 100,
      },
      estimatedUsd: 0.012,
      actualUsd: 0.014,
      pricingSource: 'fallback_catalog',
      pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
      billableToCustomer: true,
      isByoKeySpend: false,
      attemptOutcome: 'succeeded',
      occurredAt,
    })

    occurredAt.setUTCFullYear(2030)

    expect(event.occurredAt).toEqual(new Date('2026-04-16T12:34:56.000Z'))
    expect(event.occurredAt).not.toBe(occurredAt)
  })
})

describe('summarizeSpend', () => {
  it('derives totals from events and excludes BYO-key spend from platform-billable totals', () => {
    const events = [
      createModelCostEvent({
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-1',
        agentId: 'agent-1',
        actionId: 'action-1',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: { inputTokens: 100, outputTokens: 20 },
        estimatedUsd: 0.01,
        actualUsd: 10,
        pricingSource: 'provider_metadata',
        pricingReference: 'provider_metadata:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'succeeded',
        occurredAt: new Date('2026-04-16T12:00:00.000Z'),
      }),
      createModelCostEvent({
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-2',
        agentId: 'agent-2',
        actionId: 'action-2',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        tokenUsage: { inputTokens: 50, outputTokens: 10 },
        estimatedUsd: 0.004,
        actualUsd: 4,
        pricingSource: 'fallback_catalog',
        pricingReference: 'fallback_catalog:2026-04-16:anthropic/claude-3-5-sonnet',
        billableToCustomer: false,
        isByoKeySpend: true,
        attemptOutcome: 'succeeded',
        occurredAt: new Date('2026-04-16T12:01:00.000Z'),
      }),
      createModelCostEvent({
        workspaceId: WORKSPACE_B,
        runId: RUN_B,
        idempotencyKey: 'event-3',
        agentId: 'agent-1',
        actionId: 'action-3',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: { inputTokens: 75, outputTokens: 25 },
        estimatedUsd: 0.003,
        actualUsd: 2,
        pricingSource: 'provider_metadata',
        pricingReference: 'provider_metadata:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'failed',
        occurredAt: new Date('2026-04-16T12:02:00.000Z'),
      }),
    ]

    expect(sumPlatformBillableUsd(events)).toBe(12)

    expect(summarizeSpend(events)).toEqual({
      actualUsd: 16,
      platformBillableUsd: 12,
      byRun: {
        [RUN_A]: {
          actualUsd: 14,
          platformBillableUsd: 10,
        },
        [RUN_B]: {
          actualUsd: 2,
          platformBillableUsd: 2,
        },
      },
      byWorkspace: {
        [WORKSPACE_A]: {
          actualUsd: 14,
          platformBillableUsd: 10,
        },
        [WORKSPACE_B]: {
          actualUsd: 2,
          platformBillableUsd: 2,
        },
      },
      byAgent: {
        'agent-1': {
          actualUsd: 12,
          platformBillableUsd: 12,
        },
        'agent-2': {
          actualUsd: 4,
          platformBillableUsd: 0,
        },
      },
    })
  })

  it('handles prototype-polluting keys without corrupting summaries', () => {
    const events = [
      {
        costEventId: testUuid(10),
        workspaceId: '__proto__',
        runId: '__proto__',
        idempotencyKey: 'event-1',
        agentId: '__proto__',
        actionId: 'action-1',
        billableCategory: 'model',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: { inputTokens: 10, outputTokens: 2 },
        estimatedUsd: 0.001,
        actualUsd: 3,
        currency: 'USD',
        pricingSource: 'provider_metadata',
        pricingReference: 'provider_metadata:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'succeeded',
        occurredAt: new Date('2026-04-16T12:03:00.000Z'),
      },
    ]

    const summary = summarizeSpend(events)
    const expectedGroup = Object.create(null) as Record<
      string,
      { actualUsd: number; platformBillableUsd: number }
    >
    expectedGroup['__proto__'] = {
      actualUsd: 3,
      platformBillableUsd: 3,
    }

    expect(summary).toEqual({
      actualUsd: 3,
      platformBillableUsd: 3,
      byRun: expectedGroup,
      byWorkspace: expectedGroup,
      byAgent: expectedGroup,
    })
    expect(Object.getPrototypeOf(summary.byRun)).toBeNull()
    expect(Object.getPrototypeOf(summary.byWorkspace)).toBeNull()
    expect(Object.getPrototypeOf(summary.byAgent)).toBeNull()
  })
})
