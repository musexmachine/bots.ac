import { beforeEach, describe, expect, it } from 'vitest'
import {
  PolicyPermissionError,
  WorkspacePolicyValidationError,
} from '../errors.ts'
import { createActionFingerprint } from '../evaluation.ts'
import {
  approveSingleActionException,
  consumeSingleActionException,
  createPolicyVersion,
  findMatchingSingleActionException,
  getActivePolicyVersion,
} from '../service.ts'
import { createDefaultWorkspacePolicy } from '../validation.ts'
import type {
  PolicyException,
  PolicyVersion,
  WorkspacePolicyRepository,
  WorkspaceRole,
} from '../types.ts'

type InsertPolicyExceptionInput = Parameters<
  WorkspacePolicyRepository['insertPolicyException']
>[0]

function createPolicyException(
  input: InsertPolicyExceptionInput,
  index: number,
): PolicyException {
  const base = {
    policyExceptionId: `exc_${index + 1}`,
    approvedAt: new Date(`2026-04-16T21:0${index}:00.000Z`),
    consumedAt: null,
    ...input,
  }

  switch (input.actionType) {
    case 'file.change':
      return { ...base, actionType: 'file.change', targetJson: input.targetJson }
    case 'browser.session':
      return {
        ...base,
        actionType: 'browser.session',
        targetJson: input.targetJson,
      }
    case 'network.egress':
      return { ...base, actionType: 'network.egress', targetJson: input.targetJson }
    case 'integration.read':
      return {
        ...base,
        actionType: 'integration.read',
        targetJson: input.targetJson,
      }
    case 'integration.write':
      return {
        ...base,
        actionType: 'integration.write',
        targetJson: input.targetJson,
      }
  }
}

function createRepository(
  roleByWorkspaceUser: Record<string, WorkspaceRole | null> = {},
): WorkspacePolicyRepository {
  const versions: PolicyVersion[] = []
  const exceptions: PolicyException[] = []

  return {
    async getWorkspaceRole(userId, workspaceId) {
      return roleByWorkspaceUser[`${workspaceId}:${userId}`] ?? null
    },
    async getLatestPolicyVersion(workspaceId) {
      return (
        versions
          .filter((version) => version.workspaceId === workspaceId)
          .sort((left, right) => right.version - left.version)[0] ?? null
      )
    },
    async insertPolicyVersion(input) {
      const version: PolicyVersion = {
        policyVersionId: `pv_${versions.length + 1}`,
        createdAt: new Date(`2026-04-16T2${versions.length}:00:00.000Z`),
        ...input,
      }

      versions.push(version)
      return version
    },
    async insertPolicyException(input) {
      const exception = createPolicyException(input, exceptions.length)
      exceptions.push(exception)
      return exception
    },
    async findUnconsumedException(runId, targetFingerprint) {
      return (
        exceptions.find(
          (exception) =>
            exception.runId === runId &&
            exception.targetFingerprint === targetFingerprint &&
            exception.consumedAt === null,
        ) ?? null
      )
    },
    async markExceptionConsumed(policyExceptionId, consumedAt) {
      const exception = exceptions.find(
        (item) => item.policyExceptionId === policyExceptionId,
      )

      if (!exception) {
        throw new Error(`missing exception ${policyExceptionId}`)
      }

      exception.consumedAt = consumedAt
    },
  }
}

describe('createPolicyVersion', () => {
  it('requires the workspace owner role', async () => {
    const repository = createRepository({ 'ws_1:user_1': 'member' })

    await expect(() =>
      createPolicyVersion({
        repository,
        workspaceId: 'ws_1',
        createdByUserId: 'user_1',
        policy: createDefaultWorkspacePolicy(),
      }),
    ).rejects.toBeInstanceOf(PolicyPermissionError)
  })

  it('increments the version number per workspace', async () => {
    const repository = createRepository({ 'ws_1:user_1': 'owner' })

    const first = await createPolicyVersion({
      repository,
      workspaceId: 'ws_1',
      createdByUserId: 'user_1',
      policy: createDefaultWorkspacePolicy(),
    })

    const second = await createPolicyVersion({
      repository,
      workspaceId: 'ws_1',
      createdByUserId: 'user_1',
      policy: createDefaultWorkspacePolicy(),
      supersedesPolicyVersionId: first.policyVersionId,
    })

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect((await getActivePolicyVersion(repository, 'ws_1'))?.policyVersionId).toBe(
      second.policyVersionId,
    )
  })

  it('rejects superseding a non-latest version', async () => {
    const repository = createRepository({ 'ws_1:user_1': 'owner' })

    const first = await createPolicyVersion({
      repository,
      workspaceId: 'ws_1',
      createdByUserId: 'user_1',
      policy: createDefaultWorkspacePolicy(),
    })

    await createPolicyVersion({
      repository,
      workspaceId: 'ws_1',
      createdByUserId: 'user_1',
      policy: createDefaultWorkspacePolicy(),
      supersedesPolicyVersionId: first.policyVersionId,
    })

    await expect(() =>
      createPolicyVersion({
        repository,
        workspaceId: 'ws_1',
        createdByUserId: 'user_1',
        policy: createDefaultWorkspacePolicy(),
        supersedesPolicyVersionId: first.policyVersionId,
      }),
    ).rejects.toBeInstanceOf(WorkspacePolicyValidationError)
  })

  it('retries cleanly when an implicit latest-version insert loses a race', async () => {
    const repository = createRepository({ 'ws_1:user_1': 'owner' })

    await createPolicyVersion({
      repository,
      workspaceId: 'ws_1',
      createdByUserId: 'user_1',
      policy: createDefaultWorkspacePolicy(),
    })

    let failedOnce = false
    const racingRepository: WorkspacePolicyRepository = {
      ...repository,
      async insertPolicyVersion(input) {
        if (!failedOnce) {
          failedOnce = true
          await repository.insertPolicyVersion({
            ...input,
            version: input.version,
            supersedesPolicyVersionId: input.supersedesPolicyVersionId,
          })

          const error = new Error('duplicate key value violates unique constraint')
          ;(error as Error & { code: string }).code = '23505'
          throw error
        }

        return repository.insertPolicyVersion(input)
      },
    }

    const created = await createPolicyVersion({
      repository: racingRepository,
      workspaceId: 'ws_1',
      createdByUserId: 'user_1',
      policy: createDefaultWorkspacePolicy(),
    })

    expect(created.version).toBe(3)
  })

  it('turns a raced explicit supersede into a validation error', async () => {
    const repository = createRepository({ 'ws_1:user_1': 'owner' })

    const first = await createPolicyVersion({
      repository,
      workspaceId: 'ws_1',
      createdByUserId: 'user_1',
      policy: createDefaultWorkspacePolicy(),
    })

    let failedOnce = false
    const racingRepository: WorkspacePolicyRepository = {
      ...repository,
      async insertPolicyVersion(input) {
        if (!failedOnce) {
          failedOnce = true
          await repository.insertPolicyVersion({
            ...input,
            version: input.version,
            supersedesPolicyVersionId: input.supersedesPolicyVersionId,
          })

          const error = new Error('duplicate key value violates unique constraint')
          ;(error as Error & { code: string }).code = '23505'
          throw error
        }

        return repository.insertPolicyVersion(input)
      },
    }

    await expect(() =>
      createPolicyVersion({
        repository: racingRepository,
        workspaceId: 'ws_1',
        createdByUserId: 'user_1',
        policy: createDefaultWorkspacePolicy(),
        supersedesPolicyVersionId: first.policyVersionId,
      }),
    ).rejects.toThrow(
      'supersedesPolicyVersionId must match the latest workspace policy version',
    )
  })
})

describe('single-action exceptions', () => {
  let repository: WorkspacePolicyRepository

  beforeEach(() => {
    repository = createRepository({ 'ws_1:user_1': 'owner' })
  })

  it('stores and finds an exact matching exception', async () => {
    const action = {
      type: 'file.change' as const,
      target: {
        path: '/etc/hosts',
        operation: 'modify' as const,
        insideWorkspaceRoot: false,
      },
    }

    const exception = await approveSingleActionException({
      repository,
      workspaceId: 'ws_1',
      runId: 'run_1',
      policyVersionId: 'pv_1',
      agentType: 'code-agent',
      action,
      approvedByUserId: 'user_1',
    })

    expect(exception.targetFingerprint).toBe(createActionFingerprint(action))

    const found = await findMatchingSingleActionException({
      repository,
      runId: 'run_1',
      action,
    })

    expect(found?.policyExceptionId).toBe(exception.policyExceptionId)
  })

  it('requires the workspace owner role to approve an exception', async () => {
    repository = createRepository({ 'ws_1:user_1': 'member' })

    await expect(() =>
      approveSingleActionException({
        repository,
        workspaceId: 'ws_1',
        runId: 'run_1',
        policyVersionId: 'pv_1',
        agentType: 'code-agent',
        action: {
          type: 'file.change',
          target: {
            path: '/etc/hosts',
            operation: 'modify',
            insideWorkspaceRoot: false,
          },
        },
        approvedByUserId: 'user_1',
      }),
    ).rejects.toBeInstanceOf(PolicyPermissionError)
  })

  it('does not match an exception for a different run or target', async () => {
    const action = {
      type: 'file.change' as const,
      target: {
        path: '/etc/hosts',
        operation: 'modify' as const,
        insideWorkspaceRoot: false,
      },
    }

    await approveSingleActionException({
      repository,
      workspaceId: 'ws_1',
      runId: 'run_1',
      policyVersionId: 'pv_1',
      agentType: 'code-agent',
      action,
      approvedByUserId: 'user_1',
    })

    const differentRun = await findMatchingSingleActionException({
      repository,
      runId: 'run_2',
      action,
    })

    const differentTarget = await findMatchingSingleActionException({
      repository,
      runId: 'run_1',
      action: {
        type: 'file.change',
        target: {
          path: '/etc/passwd',
          operation: 'modify',
          insideWorkspaceRoot: false,
        },
      },
    })

    expect(differentRun).toBeNull()
    expect(differentTarget).toBeNull()
  })

  it('marks an exception consumed', async () => {
    const action = {
      type: 'browser.session' as const,
      target: {
        persistent: true,
      },
    }

    const exception = await approveSingleActionException({
      repository,
      workspaceId: 'ws_1',
      runId: 'run_1',
      policyVersionId: 'pv_1',
      agentType: 'web-agent',
      action,
      approvedByUserId: 'user_1',
    })

    await consumeSingleActionException(repository, exception.policyExceptionId)

    const found = await findMatchingSingleActionException({
      repository,
      runId: 'run_1',
      action,
    })

    expect(found).toBeNull()
  })
})
