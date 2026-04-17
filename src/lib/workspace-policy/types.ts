export const BUILT_IN_AGENT_TYPES = [
  'code-agent',
  'web-agent',
  'inbox-agent',
  'router-agent',
  'media-agent',
] as const

export type BuiltInAgentType = (typeof BUILT_IN_AGENT_TYPES)[number]

export const DESTINATION_TARGET_TYPES = [
  'email-domain',
  'webhook-host',
  'github-org',
  'github-repo',
  'payment-counterparty',
] as const

export type DestinationTargetType = (typeof DESTINATION_TARGET_TYPES)[number]

export type DestinationGrant = {
  accountId: string
  scope: string
  targetType: DestinationTargetType
  targetPattern: string
  spendLimitCents?: number
}

export type AgentPolicyOverride = {
  browserPersistence?: 'persistent'
  filePermissions?: {
    insideWorkspaceRoot?: 'no-delete' | 'read-only'
  }
  networkRestrictions?: {
    denyHosts?: string[]
    denyCidrs?: string[]
  }
  integrationRestrictions?: Record<
    string,
    {
      denyScopes?: string[]
      denyDestinationPatterns?: string[]
    }
  >
}

export type WorkspacePolicyDocument = {
  browserPersistenceDefault: 'ephemeral' | 'persistent'
  filePermissions: {
    insideWorkspaceRoot: 'full' | 'no-delete' | 'read-only'
    outsideWorkspaceRoot: 'exception-required'
  }
  networkEgress: {
    mode: 'broad-https' | 'curated-common' | 'allow-list-only'
    denyHosts: string[]
    denyCidrs: string[]
  }
  integrations: Record<
    string,
    {
      allowedScopes: string[]
      destinationGrants: DestinationGrant[]
    }
  >
  agentOverrides: Partial<Record<BuiltInAgentType, AgentPolicyOverride>>
}

export type FileAction = {
  type: 'file.change'
  target: {
    path: string
    operation: 'create' | 'modify' | 'delete' | 'rename'
    insideWorkspaceRoot: boolean
  }
}

export type BrowserAction = {
  type: 'browser.session'
  target: {
    persistent: boolean
  }
}

export type NetworkAction = {
  type: 'network.egress'
  target: {
    scheme: 'https' | 'http' | 'ssh' | 'tcp'
    host: string
    ipClass: 'public' | 'private' | 'localhost'
  }
}

export type IntegrationReadAction = {
  type: 'integration.read'
  target: {
    provider: string
    accountId: string
    scope: string
  }
}

export type IntegrationWriteAction = {
  type: 'integration.write'
  target: {
    provider: string
    accountId: string
    scope: string
    destinationType: DestinationTargetType
    destination: string
    spendCents?: number
  }
}

export type PolicyAction =
  | FileAction
  | BrowserAction
  | NetworkAction
  | IntegrationReadAction
  | IntegrationWriteAction

type PolicyExceptionBase = {
  policyExceptionId: string
  workspaceId: string
  runId: string
  policyVersionId: string
  agentType: BuiltInAgentType
  targetFingerprint: string
  approvedByUserId: string
  approvedAt: Date
  consumedAt: Date | null
}

export type PolicyException = {
  [ActionType in PolicyAction['type']]: PolicyExceptionBase & {
    actionType: ActionType
    targetJson: Extract<PolicyAction, { type: ActionType }>['target']
  }
}[PolicyAction['type']]

export type PolicyVersion = {
  policyVersionId: string
  workspaceId: string
  version: number
  policy: WorkspacePolicyDocument
  createdByUserId: string
  createdAt: Date
  supersedesPolicyVersionId: string | null
}

export type PolicyEvaluationInput = {
  policy: WorkspacePolicyDocument
  agentType: BuiltInAgentType
  action: PolicyAction
  matchingException?: PolicyException | null
}

export type PolicyEvaluationResult =
  | { decision: 'allow'; reason: string }
  | { decision: 'deny'; reason: string }
  | { decision: 'pause_for_exception'; reason: string; targetFingerprint: string }

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export type WorkspacePolicyRepository = {
  getWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null>
  getLatestPolicyVersion(workspaceId: string): Promise<PolicyVersion | null>
  insertPolicyVersion(
    input: Omit<PolicyVersion, 'policyVersionId' | 'createdAt'>,
  ): Promise<PolicyVersion>
  insertPolicyException(
    input: Omit<PolicyException, 'policyExceptionId' | 'approvedAt' | 'consumedAt'>,
  ): Promise<PolicyException>
  findUnconsumedException(
    runId: string,
    targetFingerprint: string,
  ): Promise<PolicyException | null>
  markExceptionConsumed(policyExceptionId: string, consumedAt: Date): Promise<void>
}
