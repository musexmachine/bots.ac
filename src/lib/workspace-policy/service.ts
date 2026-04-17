import {
  PolicyPermissionError,
  WorkspacePolicyValidationError,
} from './errors.js'
import { createActionFingerprint } from './evaluation.js'
import type {
  PolicyAction,
  PolicyException,
  PolicyVersion,
  WorkspacePolicyRepository,
} from './types.js'
import { validateWorkspacePolicyDocument } from './validation.js'

type CreatePolicyVersionInput = {
  repository: WorkspacePolicyRepository
  workspaceId: string
  createdByUserId: string
  policy: unknown
  supersedesPolicyVersionId?: string | null
}

type ApproveSingleActionExceptionInput<TAction extends PolicyAction = PolicyAction> = {
  repository: WorkspacePolicyRepository
  workspaceId: string
  runId: string
  policyVersionId: string
  agentType: PolicyException['agentType']
  action: TAction
  approvedByUserId: string
}

type FindMatchingSingleActionExceptionInput = {
  repository: WorkspacePolicyRepository
  runId: string
  action: PolicyAction
}

type InsertPolicyExceptionInput = Parameters<
  WorkspacePolicyRepository['insertPolicyException']
>[0]

async function assertWorkspaceOwner(
  repository: WorkspacePolicyRepository,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const role = await repository.getWorkspaceRole(userId, workspaceId)

  if (role !== 'owner') {
    throw new PolicyPermissionError(
      'Only workspace owners may edit policy or approve exceptions',
    )
  }
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
  workspaceId: string,
): Promise<PolicyVersion | null> {
  return repository.getLatestPolicyVersion(workspaceId)
}

export async function createPolicyVersion(
  input: CreatePolicyVersionInput,
): Promise<PolicyVersion> {
  await assertWorkspaceOwner(
    input.repository,
    input.workspaceId,
    input.createdByUserId,
  )

  const validatedPolicy = validateWorkspacePolicyDocument(input.policy)
  const latestVersion = await input.repository.getLatestPolicyVersion(
    input.workspaceId,
  )
  let currentLatestVersion = latestVersion
  let expectedSupersededPolicyVersionId = currentLatestVersion?.policyVersionId ?? null

  if (
    input.supersedesPolicyVersionId !== undefined &&
    input.supersedesPolicyVersionId !== expectedSupersededPolicyVersionId
  ) {
    throw new WorkspacePolicyValidationError(
      'supersedesPolicyVersionId must match the latest workspace policy version',
    )
  }

  const maxAttempts = input.supersedesPolicyVersionId === undefined ? 2 : 1

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await input.repository.insertPolicyVersion({
        workspaceId: input.workspaceId,
        version: currentLatestVersion ? currentLatestVersion.version + 1 : 1,
        policy: validatedPolicy,
        createdByUserId: input.createdByUserId,
        supersedesPolicyVersionId: expectedSupersededPolicyVersionId,
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }

      if (input.supersedesPolicyVersionId !== undefined) {
        throw new WorkspacePolicyValidationError(
          'supersedesPolicyVersionId must match the latest workspace policy version',
        )
      }

      currentLatestVersion = await input.repository.getLatestPolicyVersion(input.workspaceId)
      expectedSupersededPolicyVersionId = currentLatestVersion?.policyVersionId ?? null
    }
  }

  throw new WorkspacePolicyValidationError('workspace policy changed during save; retry')
}

export async function approveSingleActionException<TAction extends PolicyAction>(
  input: ApproveSingleActionExceptionInput<TAction>,
): Promise<PolicyException> {
  await assertWorkspaceOwner(
    input.repository,
    input.workspaceId,
    input.approvedByUserId,
  )

  return input.repository.insertPolicyException(
    createPolicyExceptionInput({
      workspaceId: input.workspaceId,
      runId: input.runId,
      policyVersionId: input.policyVersionId,
      agentType: input.agentType,
      action: input.action,
      approvedByUserId: input.approvedByUserId,
    }),
  )
}

export async function findMatchingSingleActionException(
  input: FindMatchingSingleActionExceptionInput,
): Promise<PolicyException | null> {
  return input.repository.findUnconsumedException(
    input.runId,
    createActionFingerprint(input.action),
  )
}

export async function consumeSingleActionException(
  repository: WorkspacePolicyRepository,
  policyExceptionId: string,
): Promise<void> {
  await repository.markExceptionConsumed(policyExceptionId, new Date())
}
