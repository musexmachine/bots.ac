import {
  PolicyPermissionError,
  WorkspacePolicyValidationError,
} from './errors.js'
import { createActionFingerprint } from './evaluation.js'
import {
  assertOptionalUuid,
  assertUuid,
  type PolicyExceptionId,
  type PolicyVersionId,
  type RunId,
  type UserId,
  type WorkspaceId,
} from '../ids.js'
import type {
  PolicyAction,
  PolicyException,
  PolicyVersion,
  WorkspacePolicyRepository,
} from './types.js'
import { validateWorkspacePolicyDocument } from './validation.js'

type CreatePolicyVersionInput = {
  repository: WorkspacePolicyRepository
  workspaceId: WorkspaceId
  createdByUserId: UserId
  policy: unknown
  supersedesPolicyVersionId?: PolicyVersionId | null
}

type ApproveSingleActionExceptionInput<TAction extends PolicyAction = PolicyAction> = {
  repository: WorkspacePolicyRepository
  workspaceId: WorkspaceId
  runId: RunId
  policyVersionId: PolicyVersionId
  agentType: PolicyException['agentType']
  action: TAction
  approvedByUserId: UserId
}

type FindMatchingSingleActionExceptionInput = {
  repository: WorkspacePolicyRepository
  runId: RunId
  action: PolicyAction
}

type InsertPolicyExceptionInput = Parameters<
  WorkspacePolicyRepository['insertPolicyException']
>[0]

async function assertWorkspaceOwner(
  repository: WorkspacePolicyRepository,
  workspaceId: WorkspaceId,
  userId: UserId,
): Promise<void> {
  const role = await repository.getWorkspaceRole(userId, workspaceId)

  if (role !== 'owner') {
    throw new PolicyPermissionError(
      'Only workspace owners may edit policy or approve exceptions',
    )
  }
}

function createValidationError(message: string): WorkspacePolicyValidationError {
  return new WorkspacePolicyValidationError(message)
}

function assertWorkspaceId(value: unknown, fieldName: string): WorkspaceId {
  return assertUuid<WorkspaceId, WorkspacePolicyValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertRunId(value: unknown, fieldName: string): RunId {
  return assertUuid<RunId, WorkspacePolicyValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertPolicyVersionId(
  value: unknown,
  fieldName: string,
): PolicyVersionId | null | undefined {
  return assertOptionalUuid<PolicyVersionId, WorkspacePolicyValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertRequiredPolicyVersionId(
  value: unknown,
  fieldName: string,
): PolicyVersionId {
  return assertUuid<PolicyVersionId, WorkspacePolicyValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertPolicyExceptionId(
  value: unknown,
  fieldName: string,
): PolicyExceptionId {
  return assertUuid<PolicyExceptionId, WorkspacePolicyValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function assertUserId(value: unknown, fieldName: string): UserId {
  return assertUuid<UserId, WorkspacePolicyValidationError>(
    value,
    fieldName,
    createValidationError,
  )
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : null
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

function createPolicyExceptionInput(
  input: Omit<ApproveSingleActionExceptionInput, 'repository'>,
): InsertPolicyExceptionInput {
  const base = {
    workspaceId: input.workspaceId,
    runId: input.runId,
    policyVersionId: input.policyVersionId,
    agentType: input.agentType,
    targetFingerprint: createActionFingerprint(input.action),
    approvedByUserId: input.approvedByUserId,
  }

  switch (input.action.type) {
    case 'file.change':
      return {
        ...base,
        actionType: 'file.change',
        targetJson: input.action.target,
      }
    case 'browser.session':
      return {
        ...base,
        actionType: 'browser.session',
        targetJson: input.action.target,
      }
    case 'network.egress':
      return {
        ...base,
        actionType: 'network.egress',
        targetJson: input.action.target,
      }
    case 'integration.read':
      return {
        ...base,
        actionType: 'integration.read',
        targetJson: input.action.target,
      }
    case 'integration.write':
      return {
        ...base,
        actionType: 'integration.write',
        targetJson: input.action.target,
      }
  }
}

export async function getActivePolicyVersion(
  repository: WorkspacePolicyRepository,
  workspaceId: WorkspaceId,
): Promise<PolicyVersion | null> {
  return repository.getLatestPolicyVersion(
    assertWorkspaceId(workspaceId, 'workspaceId'),
  )
}

export async function createPolicyVersion(
  input: CreatePolicyVersionInput,
): Promise<PolicyVersion> {
  const workspaceId = assertWorkspaceId(input.workspaceId, 'workspaceId')
  const createdByUserId = assertUserId(input.createdByUserId, 'createdByUserId')
  const hasExplicitSupersedesPolicyVersionId =
    input.supersedesPolicyVersionId !== undefined
  const supersedesPolicyVersionId = assertPolicyVersionId(
    input.supersedesPolicyVersionId,
    'supersedesPolicyVersionId',
  )
  await assertWorkspaceOwner(
    input.repository,
    workspaceId,
    createdByUserId,
  )

  const validatedPolicy = validateWorkspacePolicyDocument(input.policy)
  const latestVersion = await input.repository.getLatestPolicyVersion(workspaceId)
  let currentLatestVersion = latestVersion
  let expectedSupersededPolicyVersionId = currentLatestVersion?.policyVersionId ?? null

  if (
    hasExplicitSupersedesPolicyVersionId &&
    supersedesPolicyVersionId !== expectedSupersededPolicyVersionId
  ) {
    throw new WorkspacePolicyValidationError(
      'supersedesPolicyVersionId must match the latest workspace policy version',
    )
  }

  const maxAttempts = hasExplicitSupersedesPolicyVersionId ? 1 : 2

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await input.repository.insertPolicyVersion({
        workspaceId,
        version: currentLatestVersion ? currentLatestVersion.version + 1 : 1,
        policy: validatedPolicy,
        createdByUserId,
        supersedesPolicyVersionId: hasExplicitSupersedesPolicyVersionId
          ? supersedesPolicyVersionId ?? null
          : expectedSupersededPolicyVersionId,
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }

      if (hasExplicitSupersedesPolicyVersionId) {
        throw new WorkspacePolicyValidationError(
          'supersedesPolicyVersionId must match the latest workspace policy version',
        )
      }

      currentLatestVersion = await input.repository.getLatestPolicyVersion(workspaceId)
      expectedSupersededPolicyVersionId = currentLatestVersion?.policyVersionId ?? null
    }
  }

  throw new WorkspacePolicyValidationError('workspace policy changed during save; retry')
}

export async function approveSingleActionException<TAction extends PolicyAction>(
  input: ApproveSingleActionExceptionInput<TAction>,
): Promise<PolicyException> {
  const workspaceId = assertWorkspaceId(input.workspaceId, 'workspaceId')
  const runId = assertRunId(input.runId, 'runId')
  const policyVersionId = assertRequiredPolicyVersionId(
    input.policyVersionId,
    'policyVersionId',
  )
  const approvedByUserId = assertUserId(input.approvedByUserId, 'approvedByUserId')
  await assertWorkspaceOwner(
    input.repository,
    workspaceId,
    approvedByUserId,
  )

  return input.repository.insertPolicyException(
    createPolicyExceptionInput({
      workspaceId,
      runId,
      policyVersionId,
      agentType: input.agentType,
      action: input.action,
      approvedByUserId,
    }),
  )
}

export async function findMatchingSingleActionException(
  input: FindMatchingSingleActionExceptionInput,
): Promise<PolicyException | null> {
  return input.repository.findUnconsumedException(
    assertRunId(input.runId, 'runId'),
    createActionFingerprint(input.action),
  )
}

export async function consumeSingleActionException(
  repository: WorkspacePolicyRepository,
  policyExceptionId: PolicyExceptionId,
): Promise<void> {
  await repository.markExceptionConsumed(
    assertPolicyExceptionId(policyExceptionId, 'policyExceptionId'),
    new Date(),
  )
}
