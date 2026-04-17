import { describe, expect, it } from 'vitest'
import { testUuid } from '../../__tests__/helpers/ids.ts'
import {
  BillingConfigValidationError,
  BillingPermissionError,
  BillingWriteContentionError,
} from '../errors.js'
import { createDefaultWorkspaceBillingConfig } from '../validation.js'
import {
  createBillingConfigVersion,
  getActiveBillingConfigVersion,
  recordCostEvent,
  snapshotRunBudget,
  summarizeSpend,
} from '../service.js'
import type {
  BillingConfigVersion,
  ModelCostEvent,
  RunBudgetSnapshot,
  WorkspaceBillingRepository,
  WorkspaceRole,
} from '../types.js'

const WORKSPACE_A = testUuid(1)
const USER_A = testUuid(2)
const RUN_A = testUuid(3)
const RUN_B = testUuid(4)

function billingConfigVersionId(index: number) {
  return testUuid(100 + index)
}

function runBudgetSnapshotId(index: number) {
  return testUuid(200 + index)
}

function costEventId(index: number) {
  return testUuid(300 + index)
}

function createUniqueConstraintError(message = 'duplicate key value violates unique constraint') {
  const error = new Error(message) as Error & { code?: string }
  error.code = '23505'
  return error
}

function createRepository(
  roleByWorkspaceUser: Record<string, WorkspaceRole | null> = {},
) {
  const versions: BillingConfigVersion[] = []
  const snapshots: RunBudgetSnapshot[] = []
  const events: ModelCostEvent[] = []

  const repository: WorkspaceBillingRepository = {
    async getWorkspaceRole(userId, workspaceId) {
      return roleByWorkspaceUser[`${workspaceId}:${userId}`] ?? null
    },
    async getLatestBillingConfigVersion(workspaceId) {
      return (
        versions
          .filter((version) => version.workspaceId === workspaceId)
          .sort((left, right) => right.version - left.version)[0] ?? null
      )
    },
    async getRunBudgetSnapshot(workspaceId, runId) {
      return (
        snapshots.find(
          (snapshot) =>
            snapshot.workspaceId === workspaceId && snapshot.runId === runId,
        ) ?? null
      )
    },
    async insertBillingConfigVersion(input) {
      const createdAt = new Date(`2026-04-16T20:${versions.length}0:00.000Z`)
      const version: BillingConfigVersion = {
        billingConfigVersionId: billingConfigVersionId(versions.length),
        createdAt,
        ...input,
      }

      versions.push(version)
      return version
    },
    async insertRunBudgetSnapshot(input) {
      const snapshot: RunBudgetSnapshot = {
        runBudgetSnapshotId: runBudgetSnapshotId(snapshots.length),
        createdAt: new Date(`2026-04-16T21:${snapshots.length}0:00.000Z`),
        ...input,
      }

      snapshots.push(snapshot)
      return snapshot
    },
    async insertCostEvent(input) {
      const existing = events.find(
        (event) =>
          event.workspaceId === input.workspaceId &&
          event.runId === input.runId &&
          event.idempotencyKey === input.idempotencyKey,
      )

      if (existing !== undefined) {
        throw createUniqueConstraintError()
      }

      const event: ModelCostEvent = {
        costEventId: costEventId(events.length),
        occurredAt: new Date(`2026-04-16T22:${events.length}0:00.000Z`),
        ...input,
      }

      events.push(event)
      return event
    },
    async listCostEventsForRun(runId) {
      return events.filter((event) => event.runId === runId)
    },
    async listCostEventsForWorkspace(workspaceId) {
      return events.filter((event) => event.workspaceId === workspaceId)
    },
  }

  return { repository, versions, snapshots, events }
}

describe('createBillingConfigVersion', () => {
  it('requires the workspace owner role', async () => {
    const { repository } = createRepository({ [`${WORKSPACE_A}:${USER_A}`]: 'member' })

    await expect(() =>
      createBillingConfigVersion({
        repository,
        workspaceId: WORKSPACE_A,
        createdByUserId: USER_A,
        config: createDefaultWorkspaceBillingConfig(),
      }),
    ).rejects.toBeInstanceOf(BillingPermissionError)
  })

  it('increments versions per workspace', async () => {
    const { repository } = createRepository({ [`${WORKSPACE_A}:${USER_A}`]: 'owner' })

    const first = await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: createDefaultWorkspaceBillingConfig(),
    })

    const second = await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: {
        ...createDefaultWorkspaceBillingConfig(),
        workspaceHardBudgetUsd: 2000,
      },
    })

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect(await getActiveBillingConfigVersion(repository, WORKSPACE_A)).toEqual(
      second,
    )
  })

  it('retries through repeated unique conflicts before succeeding', async () => {
    const versions: BillingConfigVersion[] = [
      {
        billingConfigVersionId: billingConfigVersionId(0),
        workspaceId: WORKSPACE_A,
        version: 1,
        config: createDefaultWorkspaceBillingConfig(),
        createdByUserId: USER_A,
        createdAt: new Date('2026-04-16T20:00:00.000Z'),
        supersedesBillingConfigVersionId: null,
      },
    ]
    let insertAttempts = 0
    const concurrentVersions: BillingConfigVersion[] = []

    const repository: WorkspaceBillingRepository = {
      async getWorkspaceRole(userId, workspaceId) {
        return workspaceId === WORKSPACE_A && userId === USER_A ? 'owner' : null
      },
      async getLatestBillingConfigVersion(workspaceId) {
        return (
          [...versions, ...concurrentVersions]
            .filter((version) => version.workspaceId === workspaceId)
            .sort((left, right) => right.version - left.version)[0] ?? null
        )
      },
      async insertBillingConfigVersion(input) {
        insertAttempts += 1

        if (insertAttempts < 3) {
          const latest = await this.getLatestBillingConfigVersion(input.workspaceId)
          concurrentVersions.push({
            billingConfigVersionId: billingConfigVersionId(10 + insertAttempts),
            workspaceId: input.workspaceId,
            version: (latest?.version ?? 0) + 1,
            config: input.config,
            createdByUserId: input.createdByUserId,
            createdAt: new Date(`2026-04-16T20:0${insertAttempts}:30.000Z`),
            supersedesBillingConfigVersionId: latest?.billingConfigVersionId ?? null,
          })

          const error = new Error('duplicate key value violates unique constraint')
          ;(error as { code?: string }).code = '23505'
          throw error
        }

        const version: BillingConfigVersion = {
          billingConfigVersionId: billingConfigVersionId(
            versions.length + concurrentVersions.length,
          ),
          createdAt: new Date('2026-04-16T20:30:00.000Z'),
          ...input,
        }
        versions.push(version)
        return version
      },
      async insertRunBudgetSnapshot() {
        throw new Error('not used')
      },
      async insertCostEvent() {
        throw new Error('not used')
      },
      async getRunBudgetSnapshot() {
        return null
      },
      async listCostEventsForRun() {
        return []
      },
      async listCostEventsForWorkspace() {
        return []
      },
    }

    const version = await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: createDefaultWorkspaceBillingConfig(),
    })

    expect(insertAttempts).toBe(3)
    expect(version.version).toBe(4)
    expect(version.supersedesBillingConfigVersionId).toBe(billingConfigVersionId(12))
  })

  it('throws a retryable write-contention error after exhausting version retries', async () => {
    let insertAttempts = 0

    const repository: WorkspaceBillingRepository = {
      async getWorkspaceRole(userId, workspaceId) {
        return workspaceId === WORKSPACE_A && userId === USER_A ? 'owner' : null
      },
      async getLatestBillingConfigVersion() {
        return null
      },
      async insertBillingConfigVersion() {
        insertAttempts += 1
        throw createUniqueConstraintError()
      },
      async getRunBudgetSnapshot() {
        return null
      },
      async insertRunBudgetSnapshot() {
        throw new Error('not used')
      },
      async insertCostEvent() {
        throw new Error('not used')
      },
      async listCostEventsForRun() {
        return []
      },
      async listCostEventsForWorkspace() {
        return []
      },
    }

    const error = await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: createDefaultWorkspaceBillingConfig(),
    }).catch((caughtError) => caughtError)

    expect(insertAttempts).toBe(5)
    expect(error).toBeInstanceOf(BillingWriteContentionError)
    expect(error).toHaveProperty('statusCode', 503)
  })

  it('rejects non-UUID workspace ids at the service boundary', async () => {
    const { repository } = createRepository({ [`${WORKSPACE_A}:${USER_A}`]: 'owner' })

    await expect(() =>
      createBillingConfigVersion({
        repository,
        workspaceId: 'workspace-a' as never,
        createdByUserId: USER_A,
        config: createDefaultWorkspaceBillingConfig(),
      }),
    ).rejects.toThrow('workspaceId must be a valid UUID')
  })
})

describe('snapshotRunBudget', () => {
  it('rejects explicit run budgets above the workspace hard budget', async () => {
    const { repository } = createRepository({ [`${WORKSPACE_A}:${USER_A}`]: 'owner' })

    await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: createDefaultWorkspaceBillingConfig(),
    })

    await expect(() =>
      snapshotRunBudget({
        repository,
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        explicitRunBudget: {
          runHardBudgetUsd: 1001,
          runSoftBudgetUsd: 800,
        },
      }),
    ).rejects.toBeInstanceOf(BillingConfigValidationError)
  })

  it('uses workspace defaults when the run budget is inherited', async () => {
    const { repository } = createRepository({ [`${WORKSPACE_A}:${USER_A}`]: 'owner' })

    const configVersion = await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: createDefaultWorkspaceBillingConfig(),
    })

    const snapshot = await snapshotRunBudget({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
    })

    expect(snapshot).toEqual({
      runBudgetSnapshotId: snapshot.runBudgetSnapshotId,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      billingConfigVersionId: configVersion.billingConfigVersionId,
      source: 'inherited',
      runHardBudgetUsd: createDefaultWorkspaceBillingConfig().defaultRunHardBudgetUsd,
      runSoftBudgetUsd: createDefaultWorkspaceBillingConfig().defaultRunSoftBudgetUsd,
      createdAt: snapshot.createdAt,
    })
  })

  it('persists explicit run budgets', async () => {
    const { repository } = createRepository({ [`${WORKSPACE_A}:${USER_A}`]: 'owner' })

    const configVersion = await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: {
        ...createDefaultWorkspaceBillingConfig(),
        workspaceHardBudgetUsd: 200,
        workspaceSoftBudgetUsd: 160,
      },
    })

    const snapshot = await snapshotRunBudget({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      explicitRunBudget: {
        runHardBudgetUsd: 120,
        runSoftBudgetUsd: 90,
      },
    })

    expect(snapshot).toEqual({
      runBudgetSnapshotId: snapshot.runBudgetSnapshotId,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      billingConfigVersionId: configVersion.billingConfigVersionId,
      source: 'explicit',
      runHardBudgetUsd: 120,
      runSoftBudgetUsd: 90,
      createdAt: snapshot.createdAt,
    })
  })

  it('returns the existing snapshot when the same run id is started again', async () => {
    const { repository, snapshots } = createRepository({ [`${WORKSPACE_A}:${USER_A}`]: 'owner' })

    await createBillingConfigVersion({
      repository,
      workspaceId: WORKSPACE_A,
      createdByUserId: USER_A,
      config: createDefaultWorkspaceBillingConfig(),
    })

    const first = await snapshotRunBudget({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
    })

    const second = await snapshotRunBudget({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
    })

    expect(snapshots).toHaveLength(1)
    expect(second).toEqual(first)
    expect(second.runBudgetSnapshotId).toBe(first.runBudgetSnapshotId)
  })

  it('returns the existing snapshot when insert hits a unique conflict for the same run id', async () => {
    let insertAttempts = 0
    let lookupAttempts = 0
    let committedSnapshot: RunBudgetSnapshot | null = null

    const repository: WorkspaceBillingRepository = {
      async getWorkspaceRole(userId, workspaceId) {
        return workspaceId === WORKSPACE_A && userId === USER_A ? 'owner' : null
      },
      async getLatestBillingConfigVersion(workspaceId) {
        return (
          workspaceId === WORKSPACE_A
            ? {
                billingConfigVersionId: billingConfigVersionId(0),
                workspaceId,
                version: 1,
                config: createDefaultWorkspaceBillingConfig(),
                createdByUserId: USER_A,
                createdAt: new Date('2026-04-16T20:00:00.000Z'),
                supersedesBillingConfigVersionId: null,
              }
            : null
        )
      },
      async getRunBudgetSnapshot(workspaceId, runId) {
        lookupAttempts += 1
        if (lookupAttempts <= 2) {
          return null
        }

        return committedSnapshot?.workspaceId === workspaceId &&
          committedSnapshot?.runId === runId
          ? committedSnapshot
          : null
      },
      async insertBillingConfigVersion() {
        throw new Error('not used')
      },
      async insertRunBudgetSnapshot(input) {
        insertAttempts += 1
        if (committedSnapshot !== null) {
          throw createUniqueConstraintError()
        }

        committedSnapshot = {
          runBudgetSnapshotId: runBudgetSnapshotId(0),
          createdAt: new Date('2026-04-16T21:00:00.000Z'),
          ...input,
        }

        return committedSnapshot
      },
      async insertCostEvent() {
        throw new Error('not used')
      },
      async listCostEventsForRun() {
        return []
      },
      async listCostEventsForWorkspace() {
        return []
      },
    }

    const first = await snapshotRunBudget({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
    })

    const second = await snapshotRunBudget({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
    })

    expect(insertAttempts).toBe(2)
    expect(lookupAttempts).toBe(3)
    expect(second).toEqual(first)
  })
})

describe('recordCostEvent', () => {
  it('persists append-only cost events', async () => {
    const { repository, events } = createRepository()

    const first = await recordCostEvent({
      repository,
      event: {
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-a-1',
        agentId: 'agent-a',
        actionId: 'action-a',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 20,
        },
        estimatedUsd: 0.01,
        actualUsd: 0.014,
        pricingSource: 'fallback_catalog',
        pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'succeeded',
      },
    })

    const second = await recordCostEvent({
      repository,
      event: {
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-a-2',
        agentId: 'agent-a',
        actionId: 'action-a',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 10,
        },
        estimatedUsd: 0.006,
        actualUsd: 0.008,
        pricingSource: 'provider_metadata',
        pricingReference: 'provider_metadata:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'failed',
      },
    })

    expect(events).toHaveLength(2)
    expect(first.costEventId).not.toBe(second.costEventId)
    expect(events[0]).toEqual(first)
    expect(events[1]).toEqual(second)
  })

  it('returns the original event when the same idempotency key is retried', async () => {
    const { repository, events } = createRepository()

    const eventInput = {
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
      idempotencyKey: 'event-a',
      agentId: 'agent-a',
      actionId: 'action-a',
      provider: 'openai',
      model: 'gpt-5-mini',
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 20,
      },
      estimatedUsd: 0.01,
      actualUsd: 0.014,
      pricingSource: 'fallback_catalog' as const,
      pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
      billableToCustomer: true,
      isByoKeySpend: false,
      attemptOutcome: 'succeeded' as const,
    }

    const first = await recordCostEvent({
      repository,
      event: eventInput,
    })
    const second = await recordCostEvent({
      repository,
      event: eventInput,
    })

    expect(events).toHaveLength(1)
    expect(second).toEqual(first)
    expect(second.costEventId).toBe(first.costEventId)
  })

  it('preserves the caller-supplied occurredAt on the persisted event', async () => {
    const { repository, events } = createRepository()
    const occurredAt = new Date('2026-04-16T22:45:00.000Z')

    const event = await recordCostEvent({
      repository,
      event: {
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-a',
        agentId: 'agent-a',
        actionId: 'action-a',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 20,
        },
        estimatedUsd: 0.01,
        actualUsd: 0.014,
        pricingSource: 'fallback_catalog',
        pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'succeeded',
        occurredAt,
      },
    })

    expect(event.occurredAt).toEqual(occurredAt)
    expect(events[0]?.occurredAt).toEqual(occurredAt)
  })
})

describe('summarizeSpend', () => {
  it('returns the run and workspace totals needed by the guard', async () => {
    const { repository } = createRepository()

    await recordCostEvent({
      repository,
      event: {
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-a',
        agentId: 'agent-a',
        actionId: 'action-a',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 20,
        },
        estimatedUsd: 0.01,
        actualUsd: 10,
        pricingSource: 'fallback_catalog',
        pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'succeeded',
      },
    })

    await recordCostEvent({
      repository,
      event: {
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-b',
        agentId: 'agent-b',
        actionId: 'action-b',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        tokenUsage: {
          inputTokens: 80,
          outputTokens: 10,
        },
        estimatedUsd: 0.004,
        actualUsd: 4,
        pricingSource: 'provider_metadata',
        pricingReference: 'provider_metadata:anthropic/claude-3-5-sonnet',
        billableToCustomer: false,
        isByoKeySpend: true,
        attemptOutcome: 'failed',
      },
    })

    await recordCostEvent({
      repository,
      event: {
        workspaceId: WORKSPACE_A,
        runId: RUN_B,
        idempotencyKey: 'event-c',
        agentId: 'agent-a',
        actionId: 'action-c',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: {
          inputTokens: 30,
          outputTokens: 5,
        },
        estimatedUsd: 0.002,
        actualUsd: 2,
        pricingSource: 'provider_metadata',
        pricingReference: 'provider_metadata:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'succeeded',
      },
    })

    const summary = await summarizeSpend({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
    })

    expect(summary).toEqual({
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
          actualUsd: 16,
          platformBillableUsd: 12,
        },
      },
      byAgent: {
        'agent-a': {
          actualUsd: 12,
          platformBillableUsd: 12,
        },
        'agent-b': {
          actualUsd: 4,
          platformBillableUsd: 0,
        },
      },
    })
  })

  it('uses one workspace snapshot for both workspace and run totals', async () => {
    const workspaceSnapshot: ModelCostEvent[] = [
      {
        costEventId: costEventId(0),
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-a',
        agentId: 'agent-a',
        actionId: 'action-a',
        billableCategory: 'model',
        provider: 'openai',
        model: 'gpt-5-mini',
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 20,
        },
        estimatedUsd: 0.01,
        actualUsd: 10,
        currency: 'USD',
        pricingSource: 'fallback_catalog',
        pricingReference: 'fallback_catalog:2026-04-16:openai/gpt-5-mini',
        billableToCustomer: true,
        isByoKeySpend: false,
        attemptOutcome: 'succeeded',
        occurredAt: new Date('2026-04-16T22:00:00.000Z'),
      },
    ]
    const divergentRunSnapshot: ModelCostEvent[] = [
      ...workspaceSnapshot,
      {
        costEventId: costEventId(1),
        workspaceId: WORKSPACE_A,
        runId: RUN_A,
        idempotencyKey: 'event-b',
        agentId: 'agent-b',
        actionId: 'action-b',
        billableCategory: 'model',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        tokenUsage: {
          inputTokens: 80,
          outputTokens: 10,
        },
        estimatedUsd: 0.004,
        actualUsd: 4,
        currency: 'USD',
        pricingSource: 'provider_metadata',
        pricingReference: 'provider_metadata:anthropic/claude-3-5-sonnet',
        billableToCustomer: false,
        isByoKeySpend: true,
        attemptOutcome: 'failed',
        occurredAt: new Date('2026-04-16T22:10:00.000Z'),
      },
    ]
    let workspaceReads = 0

    const repository: WorkspaceBillingRepository = {
      async getWorkspaceRole() {
        return null
      },
      async getLatestBillingConfigVersion() {
        return null
      },
      async insertBillingConfigVersion() {
        throw new Error('not used')
      },
      async getRunBudgetSnapshot() {
        return null
      },
      async insertRunBudgetSnapshot() {
        throw new Error('not used')
      },
      async insertCostEvent() {
        throw new Error('not used')
      },
      async listCostEventsForRun() {
        return divergentRunSnapshot
      },
      async listCostEventsForWorkspace() {
        workspaceReads += 1
        return workspaceReads === 1 ? workspaceSnapshot : divergentRunSnapshot
      },
    }

    const summary = await summarizeSpend({
      repository,
      workspaceId: WORKSPACE_A,
      runId: RUN_A,
    })

    expect(summary).toEqual({
      actualUsd: 10,
      platformBillableUsd: 10,
      byRun: {
        [RUN_A]: {
          actualUsd: 10,
          platformBillableUsd: 10,
        },
      },
      byWorkspace: {
        [WORKSPACE_A]: {
          actualUsd: 10,
          platformBillableUsd: 10,
        },
      },
      byAgent: {
        'agent-a': {
          actualUsd: 10,
          platformBillableUsd: 10,
        },
      },
    })
  })
})
