import {
  BUILT_IN_AGENT_TYPES,
  DESTINATION_TARGET_TYPES,
  type AgentPolicyOverride,
  type DestinationGrant,
  type WorkspacePolicyDocument,
} from './types.js'
import { WorkspacePolicyValidationError } from './errors.js'
import {
  isValidCidrNotation,
  isValidDestinationPattern,
  normalizeDestinationPattern,
  normalizeNetworkHost,
} from './evaluation.js'

const FILE_PERMISSION_RANK = {
  'read-only': 0,
  'no-delete': 1,
  full: 2,
} as const

const AGENT_OVERRIDE_KEYS = [
  'browserPersistence',
  'filePermissions',
  'networkRestrictions',
  'integrationRestrictions',
] as const

const FILE_PERMISSION_KEYS = [
  'insideWorkspaceRoot',
  'outsideWorkspaceRoot',
] as const
const FILE_PERMISSION_OVERRIDE_KEYS = ['insideWorkspaceRoot'] as const
const NETWORK_EGRESS_KEYS = ['mode', 'denyHosts', 'denyCidrs'] as const
const NETWORK_RESTRICTION_KEYS = ['denyHosts', 'denyCidrs'] as const
const INTEGRATION_RESTRICTION_KEYS = [
  'denyScopes',
  'denyDestinationPatterns',
] as const
const WORKSPACE_POLICY_KEYS = [
  'browserPersistenceDefault',
  'filePermissions',
  'networkEgress',
  'integrations',
  'agentOverrides',
] as const
const INTEGRATION_CONFIG_KEYS = ['allowedScopes', 'destinationGrants'] as const
const DESTINATION_GRANT_KEYS = [
  'accountId',
  'scope',
  'targetType',
  'targetPattern',
  'spendLimitCents',
] as const

type AgentFilePermission = NonNullable<
  AgentPolicyOverride['filePermissions']
>['insideWorkspaceRoot']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WorkspacePolicyValidationError(message)
  }

  return value
}

function assertKnownKeys(
  input: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: string,
): void {
  const unknownKey = Object.keys(input).find((key) => !allowedKeys.includes(key))

  if (unknownKey !== undefined) {
    throw new WorkspacePolicyValidationError(
      `${context} contains unknown field: ${unknownKey}`,
    )
  }
}

function assertStringArray(value: unknown, message: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new WorkspacePolicyValidationError(message)
  }

  return value
}

function assertCidrArray(value: unknown, context: string): string[] {
  const cidrs = assertStringArray(value, `${context} must be a string array`)
  const invalidCidr = cidrs.find((cidr) => !isValidCidrNotation(cidr))

  if (invalidCidr !== undefined) {
    throw new WorkspacePolicyValidationError(
      `${context} contains invalid CIDR: ${invalidCidr}`,
    )
  }

  return cidrs
}

function assertHostArray(value: unknown, context: string): string[] {
  const hosts = assertStringArray(value, `${context} must be a string array`)
  const invalidHost = hosts.find((host) => normalizeNetworkHost(host) === null)

  if (invalidHost !== undefined) {
    throw new WorkspacePolicyValidationError(
      `${context} contains invalid host: ${invalidHost}`,
    )
  }

  return hosts
}

function getProviderDestinationTypes(
  policy: WorkspacePolicyDocument,
  provider: string,
): DestinationGrant['targetType'][] {
  return Array.from(
    new Set(
      policy.integrations[provider]?.destinationGrants.map(
        (grant) => grant.targetType,
      ) ?? [],
    ),
  )
}

function assertDestinationPatternArray(
  value: unknown,
  provider: string,
  policy: WorkspacePolicyDocument,
): string[] {
  const patterns = assertStringArray(
    value,
    `${provider} denyDestinationPatterns must be a string array`,
  )
  const destinationTypes = getProviderDestinationTypes(policy, provider)

  if (patterns.length > 0 && destinationTypes.length === 0) {
    throw new WorkspacePolicyValidationError(
      `${provider} denyDestinationPatterns cannot be validated without destination grants`,
    )
  }

  const invalidPattern = patterns.find(
    (pattern) =>
      !destinationTypes.some((destinationType) =>
        isValidDestinationPattern(destinationType, pattern),
      ),
  )

  if (invalidPattern !== undefined) {
    throw new WorkspacePolicyValidationError(
      `${provider} denyDestinationPatterns contains invalid destination pattern for ${destinationTypes.join(', ')}: ${invalidPattern}`,
    )
  }

  return patterns
}

function assertUniqueDestinationGrants(
  grants: DestinationGrant[],
  provider: string,
): void {
  const seenGrantKeys = new Set<string>()

  for (const grant of grants) {
    const normalizedPattern = normalizeDestinationPattern(
      grant.targetType,
      grant.targetPattern,
    )

    if (normalizedPattern === null) {
      throw new WorkspacePolicyValidationError(
        `${provider} destinationGrants contains invalid destination pattern: ${grant.targetPattern}`,
      )
    }

    const grantKey = [
      grant.accountId,
      grant.scope,
      grant.targetType,
      normalizedPattern,
    ].join('\u001f')

    if (seenGrantKeys.has(grantKey)) {
      throw new WorkspacePolicyValidationError(
        `${provider} destinationGrants contains duplicate grant for ${grant.scope} ${grant.targetType} ${normalizedPattern}`,
      )
    }

    seenGrantKeys.add(grantKey)
  }
}

function validateDestinationGrant(input: unknown): DestinationGrant {
  if (!isRecord(input)) {
    throw new WorkspacePolicyValidationError('destination grant must be an object')
  }

  assertKnownKeys(input, DESTINATION_GRANT_KEYS, 'destination grant')

  const targetType = assertString(
    input.targetType,
    'destination grant targetType is required',
  )

  if (
    !DESTINATION_TARGET_TYPES.includes(
      targetType as (typeof DESTINATION_TARGET_TYPES)[number],
    )
  ) {
    throw new WorkspacePolicyValidationError(
      `unsupported destination grant targetType: ${targetType}`,
    )
  }

  const spendLimit = input.spendLimitCents

  if (
    spendLimit !== undefined &&
    (typeof spendLimit !== 'number' ||
      !Number.isInteger(spendLimit) ||
      spendLimit < 0)
  ) {
    throw new WorkspacePolicyValidationError(
      'spendLimitCents must be a non-negative integer when provided',
    )
  }

  const targetPattern = assertString(
    input.targetPattern,
    'destination grant targetPattern is required',
  )

  if (
    !isValidDestinationPattern(
      targetType as DestinationGrant['targetType'],
      targetPattern,
    )
  ) {
    throw new WorkspacePolicyValidationError(
      `destination grant targetPattern is malformed for ${targetType}`,
    )
  }

  return {
    accountId: assertString(
      input.accountId,
      'destination grant accountId is required',
    ),
    scope: assertString(input.scope, 'destination grant scope is required'),
    targetType: targetType as DestinationGrant['targetType'],
    targetPattern,
    ...(spendLimit === undefined ? {} : { spendLimitCents: spendLimit }),
  }
}

function validateAgentOverride(
  input: unknown,
  basePolicy: WorkspacePolicyDocument,
): AgentPolicyOverride {
  if (!isRecord(input)) {
    throw new WorkspacePolicyValidationError('agent override must be an object')
  }

  assertKnownKeys(input, AGENT_OVERRIDE_KEYS, 'agent override')

  const override: AgentPolicyOverride = {}

  if (input.browserPersistence !== undefined) {
    if (input.browserPersistence !== 'persistent') {
      throw new WorkspacePolicyValidationError(
        'agent browserPersistence may only opt in to persistent',
      )
    }

    override.browserPersistence = 'persistent'
  }

  if (input.filePermissions !== undefined) {
    if (!isRecord(input.filePermissions)) {
      throw new WorkspacePolicyValidationError(
        'agent filePermissions must be an object',
      )
    }

    assertKnownKeys(
      input.filePermissions,
      FILE_PERMISSION_OVERRIDE_KEYS,
      'agent filePermissions',
    )

    const inside = input.filePermissions.insideWorkspaceRoot

    if (
      inside !== undefined &&
      inside !== 'no-delete' &&
      inside !== 'read-only'
    ) {
      throw new WorkspacePolicyValidationError(
        'agent file override must be no-delete or read-only',
      )
    }

    if (
      inside !== undefined &&
      FILE_PERMISSION_RANK[inside] >
        FILE_PERMISSION_RANK[basePolicy.filePermissions.insideWorkspaceRoot]
    ) {
      throw new WorkspacePolicyValidationError(
        'agent file override cannot broaden workspace permissions',
      )
    }

    override.filePermissions =
      inside === undefined
        ? {}
        : { insideWorkspaceRoot: inside as AgentFilePermission }
  }

  if (input.networkRestrictions !== undefined) {
    if (!isRecord(input.networkRestrictions)) {
      throw new WorkspacePolicyValidationError(
        'agent networkRestrictions must be an object',
      )
    }

    assertKnownKeys(
      input.networkRestrictions,
      NETWORK_RESTRICTION_KEYS,
      'agent networkRestrictions',
    )

    const denyHosts =
      input.networkRestrictions.denyHosts === undefined
        ? undefined
        : assertHostArray(
            input.networkRestrictions.denyHosts,
            'agent denyHosts',
          )
    const denyCidrs =
      input.networkRestrictions.denyCidrs === undefined
        ? undefined
        : assertCidrArray(input.networkRestrictions.denyCidrs, 'agent denyCidrs')

    override.networkRestrictions = {
      ...(denyHosts === undefined ? {} : { denyHosts }),
      ...(denyCidrs === undefined ? {} : { denyCidrs }),
    }
  }

  if (input.integrationRestrictions !== undefined) {
    if (!isRecord(input.integrationRestrictions)) {
      throw new WorkspacePolicyValidationError(
        'agent integrationRestrictions must be an object',
      )
    }

    override.integrationRestrictions = Object.fromEntries(
      Object.entries(input.integrationRestrictions).map(
        ([provider, restriction]) => {
          if (!isRecord(restriction)) {
            throw new WorkspacePolicyValidationError(
              `integration restriction for ${provider} must be an object`,
            )
          }

          assertKnownKeys(
            restriction,
            INTEGRATION_RESTRICTION_KEYS,
            `${provider} integration restriction`,
          )

          const denyScopes =
            restriction.denyScopes === undefined
              ? undefined
              : assertStringArray(
                  restriction.denyScopes,
                  `${provider} denyScopes must be a string array`,
                )
          const denyDestinationPatterns =
            restriction.denyDestinationPatterns === undefined
              ? undefined
              : assertDestinationPatternArray(
                  restriction.denyDestinationPatterns,
                  provider,
                  basePolicy,
                )

          return [
            provider,
            {
              ...(denyScopes === undefined ? {} : { denyScopes }),
              ...(denyDestinationPatterns === undefined
                ? {}
                : { denyDestinationPatterns }),
            },
          ]
        },
      ),
    ) as NonNullable<AgentPolicyOverride['integrationRestrictions']>
  }

  return override
}

export function createDefaultWorkspacePolicy(): WorkspacePolicyDocument {
  return {
    browserPersistenceDefault: 'ephemeral',
    filePermissions: {
      insideWorkspaceRoot: 'full',
      outsideWorkspaceRoot: 'exception-required',
    },
    networkEgress: {
      mode: 'broad-https',
      denyHosts: ['localhost'],
      denyCidrs: [
        '127.0.0.0/8',
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        '169.254.0.0/16',
        '::1/128',
        'fc00::/7',
        'fe80::/10',
      ],
    },
    integrations: {},
    agentOverrides: {},
  }
}

export function validateWorkspacePolicyDocument(
  input: unknown,
): WorkspacePolicyDocument {
  if (!isRecord(input)) {
    throw new WorkspacePolicyValidationError(
      'workspace policy document must be an object',
    )
  }

  assertKnownKeys(input, WORKSPACE_POLICY_KEYS, 'workspace policy')

  const browserPersistenceDefault = assertString(
    input.browserPersistenceDefault,
    'browserPersistenceDefault is required',
  )

  if (
    browserPersistenceDefault !== 'ephemeral' &&
    browserPersistenceDefault !== 'persistent'
  ) {
    throw new WorkspacePolicyValidationError(
      'browserPersistenceDefault must be ephemeral or persistent',
    )
  }

  if (!isRecord(input.filePermissions)) {
    throw new WorkspacePolicyValidationError('filePermissions is required')
  }

  assertKnownKeys(input.filePermissions, FILE_PERMISSION_KEYS, 'filePermissions')

  const insideWorkspaceRoot = assertString(
    input.filePermissions.insideWorkspaceRoot,
    'filePermissions.insideWorkspaceRoot is required',
  )

  if (
    insideWorkspaceRoot !== 'full' &&
    insideWorkspaceRoot !== 'no-delete' &&
    insideWorkspaceRoot !== 'read-only'
  ) {
    throw new WorkspacePolicyValidationError(
      'unsupported file permission for insideWorkspaceRoot',
    )
  }

  const outsideWorkspaceRoot = assertString(
    input.filePermissions.outsideWorkspaceRoot,
    'filePermissions.outsideWorkspaceRoot is required',
  )

  if (outsideWorkspaceRoot !== 'exception-required') {
    throw new WorkspacePolicyValidationError(
      'outsideWorkspaceRoot must stay exception-required at launch',
    )
  }

  if (!isRecord(input.networkEgress)) {
    throw new WorkspacePolicyValidationError('networkEgress is required')
  }

  assertKnownKeys(input.networkEgress, NETWORK_EGRESS_KEYS, 'networkEgress')

  const networkMode = assertString(
    input.networkEgress.mode,
    'networkEgress.mode is required',
  )

  if (
    networkMode !== 'broad-https' &&
    networkMode !== 'curated-common' &&
    networkMode !== 'allow-list-only'
  ) {
    throw new WorkspacePolicyValidationError('unsupported networkEgress.mode')
  }

  const basePolicy: WorkspacePolicyDocument = {
    browserPersistenceDefault,
    filePermissions: {
      insideWorkspaceRoot,
      outsideWorkspaceRoot: 'exception-required',
    },
    networkEgress: {
      mode: networkMode,
      denyHosts: assertHostArray(
        input.networkEgress.denyHosts,
        'networkEgress.denyHosts',
      ),
      denyCidrs: assertCidrArray(
        input.networkEgress.denyCidrs,
        'networkEgress.denyCidrs',
      ),
    },
    integrations: {},
    agentOverrides: {},
  }

  if (!isRecord(input.integrations)) {
    throw new WorkspacePolicyValidationError('integrations must be an object')
  }

  basePolicy.integrations = Object.fromEntries(
    Object.entries(input.integrations).map(([provider, grantConfig]) => {
      if (!isRecord(grantConfig)) {
        throw new WorkspacePolicyValidationError(
          `integration config for ${provider} must be an object`,
        )
      }

      assertKnownKeys(grantConfig, INTEGRATION_CONFIG_KEYS, `${provider} integration config`)

      if (!Array.isArray(grantConfig.destinationGrants)) {
        throw new WorkspacePolicyValidationError(
          `${provider} destinationGrants must be an array`,
        )
      }

      return [
        provider,
        (() => {
          const destinationGrants =
            grantConfig.destinationGrants.map(validateDestinationGrant)
          assertUniqueDestinationGrants(destinationGrants, provider)

          return {
          allowedScopes: assertStringArray(
            grantConfig.allowedScopes,
            `${provider} allowedScopes must be a string array`,
          ),
            destinationGrants,
          }
        })(),
      ]
    }),
  ) as WorkspacePolicyDocument['integrations']

  if (!isRecord(input.agentOverrides)) {
    throw new WorkspacePolicyValidationError(
      'agentOverrides must be an object',
    )
  }

  basePolicy.agentOverrides = Object.fromEntries(
    Object.entries(input.agentOverrides).map(([agentType, override]) => {
      if (
        !BUILT_IN_AGENT_TYPES.includes(
          agentType as (typeof BUILT_IN_AGENT_TYPES)[number],
        )
      ) {
        throw new WorkspacePolicyValidationError(
          `unsupported agent override key: ${agentType}`,
        )
      }

      return [agentType, validateAgentOverride(override, basePolicy)]
    }),
  ) as WorkspacePolicyDocument['agentOverrides']

  return basePolicy
}
