import type {
  AgentPolicyOverride,
  DestinationGrant,
  IntegrationWriteAction,
  PolicyAction,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  WorkspacePolicyDocument,
} from './types.js'

const HARD_BLOCKED_NETWORK_CIDRS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
] as const

function createFilePermissionRank(
  permission: WorkspacePolicyDocument['filePermissions']['insideWorkspaceRoot'],
): number {
  switch (permission) {
    case 'read-only':
      return 0
    case 'no-delete':
      return 1
    case 'full':
      return 2
  }
}

function getOverride(
  policy: WorkspacePolicyDocument,
  agentType: PolicyEvaluationInput['agentType'],
): AgentPolicyOverride {
  return policy.agentOverrides[agentType] ?? {}
}

function getEffectiveFilePermission(
  policy: WorkspacePolicyDocument,
  agentType: PolicyEvaluationInput['agentType'],
) {
  const overrideValue = getOverride(policy, agentType).filePermissions?.insideWorkspaceRoot

  if (!overrideValue) {
    return policy.filePermissions.insideWorkspaceRoot
  }

  return createFilePermissionRank(overrideValue) <
    createFilePermissionRank(policy.filePermissions.insideWorkspaceRoot)
    ? overrideValue
    : policy.filePermissions.insideWorkspaceRoot
}

function getDeniedHosts(
  policy: WorkspacePolicyDocument,
  agentType: PolicyEvaluationInput['agentType'],
) {
  const overrideHosts = getOverride(policy, agentType).networkRestrictions?.denyHosts ?? []
  return new Set(
    [...policy.networkEgress.denyHosts, ...overrideHosts].map((host) =>
      normalizeComparableHost(host),
    ),
  )
}

function getDeniedCidrs(
  policy: WorkspacePolicyDocument,
  agentType: PolicyEvaluationInput['agentType'],
) {
  const overrideCidrs = getOverride(policy, agentType).networkRestrictions?.denyCidrs ?? []
  return [...policy.networkEgress.denyCidrs, ...overrideCidrs]
}

type ParsedIpAddress = {
  bits: 32 | 128
  value: bigint
}

type IntegrationDestinationType = IntegrationWriteAction['target']['destinationType']

const INTEGRATION_PROVIDER_PATTERN = /^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i
const INTEGRATION_SCOPE_PATTERN = /^[a-z\d](?:[a-z\d._:-]*[a-z\d])?$/i

function normalizeHostname(host: string): string | null {
  const normalizedHost = host.endsWith('.') ? host.slice(0, host.length - 1) : host

  if (normalizedHost.length === 0 || normalizedHost.length > 253) {
    return null
  }

  const labels = normalizedHost.split('.')

  if (
    labels.some((label) => label.length === 0 || label.length > 63) ||
    (labels.length === 4 && labels.every((label) => /^\d+$/.test(label)))
  ) {
    return null
  }

  const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

  return labels.every((label) => labelPattern.test(label))
    ? normalizedHost.toLowerCase()
    : null
}

function normalizeIpLiteral(host: string): string {
  const unwrapped =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, host.length - 1) : host
  const zoneSeparatorIndex = unwrapped.indexOf('%')

  return zoneSeparatorIndex === -1
    ? unwrapped
    : unwrapped.slice(0, zoneSeparatorIndex)
}

function formatIpv4Literal(value: bigint): string {
  return [
    Number((value >> 24n) & 0xffn),
    Number((value >> 16n) & 0xffn),
    Number((value >> 8n) & 0xffn),
    Number(value & 0xffn),
  ].join('.')
}

function formatIpv6Literal(value: bigint): string {
  const groups = new Array<number>(8)
  let remaining = value

  for (let index = 7; index >= 0; index -= 1) {
    groups[index] = Number(remaining & 0xffffn)
    remaining >>= 16n
  }

  let bestRunStart = -1
  let bestRunLength = 0
  let currentRunStart = -1

  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index] === 0) {
      if (currentRunStart === -1) {
        currentRunStart = index
      }
      continue
    }

    if (currentRunStart !== -1) {
      const currentRunLength = index - currentRunStart
      if (currentRunLength > bestRunLength && currentRunLength > 1) {
        bestRunStart = currentRunStart
        bestRunLength = currentRunLength
      }
      currentRunStart = -1
    }
  }

  if (currentRunStart !== -1) {
    const currentRunLength = groups.length - currentRunStart
    if (currentRunLength > bestRunLength && currentRunLength > 1) {
      bestRunStart = currentRunStart
      bestRunLength = currentRunLength
    }
  }

  const formatGroup = (group: number): string => group.toString(16)

  if (bestRunLength === 0) {
    return groups.map(formatGroup).join(':')
  }

  const head = groups
    .slice(0, bestRunStart)
    .map(formatGroup)
    .join(':')
  const tail = groups
    .slice(bestRunStart + bestRunLength)
    .map(formatGroup)
    .join(':')

  if (head.length === 0 && tail.length === 0) {
    return '::'
  }

  if (head.length === 0) {
    return `::${tail}`
  }

  if (tail.length === 0) {
    return `${head}::`
  }

  return `${head}::${tail}`
}

function formatParsedIpAddress(host: ParsedIpAddress): string {
  return host.bits === 32
    ? formatIpv4Literal(host.value)
    : formatIpv6Literal(host.value)
}

function parseIpv4Literal(host: string): bigint | null {
  const octets = host.split('.')

  if (octets.length !== 4) {
    return null
  }

  let value = 0n

  for (const octet of octets) {
    if (!/^\d+$/.test(octet)) {
      return null
    }

    const parsedOctet = Number(octet)

    if (!Number.isInteger(parsedOctet) || parsedOctet < 0 || parsedOctet > 255) {
      return null
    }

    value = (value << 8n) | BigInt(parsedOctet)
  }

  return value
}

function parseIpv6Section(section: string): number[] | null {
  if (section === '') {
    return []
  }

  const groups = section.split(':')
  const parsedGroups: number[] = []

  for (const group of groups) {
    if (group.includes('.')) {
      const ipv4Value = parseIpv4Literal(group)

      if (ipv4Value === null) {
        return null
      }

      parsedGroups.push(
        Number((ipv4Value >> 16n) & 0xffffn),
        Number(ipv4Value & 0xffffn),
      )
      continue
    }

    if (!/^[\da-f]{1,4}$/i.test(group)) {
      return null
    }

    parsedGroups.push(Number.parseInt(group, 16))
  }

  return parsedGroups
}

function parseIpv6Literal(host: string): bigint | null {
  const normalizedHost = normalizeIpLiteral(host).toLowerCase()
  const compressedSections = normalizedHost.split('::')

  if (compressedSections.length > 2) {
    return null
  }

  const hasCompression = compressedSections.length === 2
  const headGroups = parseIpv6Section(compressedSections[0] ?? '')
  const tailGroups = parseIpv6Section(compressedSections[1] ?? '')

  if (headGroups === null || tailGroups === null) {
    return null
  }

  const explicitGroupCount = headGroups.length + tailGroups.length

  if (hasCompression ? explicitGroupCount >= 8 : explicitGroupCount !== 8) {
    return null
  }

  const groups = hasCompression
    ? [
        ...headGroups,
        ...new Array<number>(8 - explicitGroupCount).fill(0),
        ...tailGroups,
      ]
    : headGroups

  let value = 0n

  for (const group of groups) {
    value = (value << 16n) | BigInt(group)
  }

  return value
}

function parseIpLiteral(host: string): ParsedIpAddress | null {
  const normalizedHost = normalizeIpLiteral(host)

  if (normalizedHost.includes(':')) {
    const ipv6Value = parseIpv6Literal(normalizedHost)
    if (ipv6Value === null) {
      return null
    }

    return { bits: 128, value: ipv6Value }
  }

  const ipv4Value = parseIpv4Literal(normalizedHost)
  return ipv4Value === null ? null : { bits: 32, value: ipv4Value }
}

function extractIpv4MappedValue(host: ParsedIpAddress): bigint | null {
  if (host.bits !== 128) {
    return null
  }

  if (host.value >> 32n !== 0xffffn) {
    return null
  }

  return host.value & 0xffffffffn
}

function parseCidrNotation(cidr: string): (ParsedIpAddress & { prefixLength: number }) | null {
  const slashIndex = cidr.lastIndexOf('/')

  if (slashIndex === -1) {
    return null
  }

  const address = cidr.slice(0, slashIndex)
  const prefixLengthValue = cidr.slice(slashIndex + 1)

  if (!/^\d+$/.test(prefixLengthValue)) {
    return null
  }

  const parsedAddress = parseIpLiteral(address)

  if (parsedAddress === null) {
    return null
  }

  const prefixLength = Number(prefixLengthValue)

  if (prefixLength < 0 || prefixLength > parsedAddress.bits) {
    return null
  }

  return { ...parsedAddress, prefixLength }
}

export function isValidCidrNotation(cidr: string): boolean {
  return parseCidrNotation(cidr) !== null
}

export function normalizeNetworkHost(host: string): string | null {
  const parsedIpLiteral = parseIpLiteral(host)

  if (parsedIpLiteral !== null) {
    return formatParsedIpAddress(parsedIpLiteral)
  }

  return normalizeHostname(host)
}

function normalizeComparableHost(host: string): string {
  return normalizeNetworkHost(host) ?? host.toLowerCase()
}

function isDeniedByCidr(host: string, deniedCidrs: readonly string[]): boolean {
  const parsedHost = parseIpLiteral(host)

  if (parsedHost === null) {
    return false
  }

  const equivalentHosts = [parsedHost]
  const ipv4MappedValue = extractIpv4MappedValue(parsedHost)

  if (ipv4MappedValue !== null) {
    equivalentHosts.push({ bits: 32, value: ipv4MappedValue })
  }

  return deniedCidrs.some((cidr) => {
    const parsedCidr = parseCidrNotation(cidr)

    if (parsedCidr === null || parsedCidr.bits !== parsedHost.bits) {
      return (
        parsedCidr !== null &&
        equivalentHosts.some((equivalentHost) => {
          if (equivalentHost.bits !== parsedCidr.bits) {
            return false
          }

          const shift = BigInt(equivalentHost.bits - parsedCidr.prefixLength)
          return shift === 0n
            ? equivalentHost.value === parsedCidr.value
            : equivalentHost.value >> shift === parsedCidr.value >> shift
        })
      )
    }

    const shift = BigInt(parsedHost.bits - parsedCidr.prefixLength)
    return shift === 0n
      ? parsedHost.value === parsedCidr.value
      : parsedHost.value >> shift === parsedCidr.value >> shift
  })
}

function isHardBlockedNetworkHost(host: string): boolean {
  return host === 'localhost' || isDeniedByCidr(host, HARD_BLOCKED_NETWORK_CIDRS)
}

function getIntegrationRestriction(
  policy: WorkspacePolicyDocument,
  agentType: PolicyEvaluationInput['agentType'],
  provider: string,
) {
  return getOverride(policy, agentType).integrationRestrictions?.[provider]
}

function isWellFormedIntegrationProvider(provider: string): boolean {
  return INTEGRATION_PROVIDER_PATTERN.test(provider)
}

function isWellFormedIntegrationScope(scope: string): boolean {
  return INTEGRATION_SCOPE_PATTERN.test(scope)
}

function normalizeEmailDestination(destination: string): string | null {
  const atIndex = destination.indexOf('@')

  if (
    atIndex <= 0 ||
    atIndex !== destination.lastIndexOf('@') ||
    atIndex === destination.length - 1
  ) {
    return null
  }

  const localPart = destination.slice(0, atIndex)

  if (/\s|@/.test(localPart)) {
    return null
  }

  return normalizeHostname(destination.slice(atIndex + 1))
}

function normalizeGithubOrg(destination: string): string | null {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(destination)
    ? destination.toLowerCase()
    : null
}

function normalizeGithubRepo(destination: string): string | null {
  const [owner, repo, extra] = destination.split('/')

  if (extra !== undefined || owner === undefined || repo === undefined) {
    return null
  }

  const normalizedOwner = normalizeGithubOrg(owner)

  if (
    normalizedOwner === null ||
    repo.length === 0 ||
    !/^[a-z\d._-]+$/i.test(repo)
  ) {
    return null
  }

  return `${normalizedOwner}/${repo.toLowerCase()}`
}

function normalizePaymentCounterparty(destination: string): string | null {
  return destination.length === 0 ? null : destination
}

export function normalizeDestinationPattern(
  destinationType: IntegrationDestinationType,
  pattern: string,
): string | null {
  switch (destinationType) {
    case 'email-domain':
      return normalizeHostname(pattern)
    case 'webhook-host':
      return normalizeNetworkHost(pattern)
    case 'github-org':
      return normalizeGithubOrg(pattern)
    case 'github-repo':
      return normalizeGithubRepo(pattern)
    case 'payment-counterparty':
      return normalizePaymentCounterparty(pattern)
    default:
      return null
  }
}

export function isValidDestinationPattern(
  destinationType: IntegrationDestinationType,
  pattern: string,
): boolean {
  return normalizeDestinationPattern(destinationType, pattern) !== null
}

function normalizeIntegrationDestination(
  action: IntegrationWriteAction,
): string | null {
  switch (action.target.destinationType) {
    case 'email-domain':
      return normalizeEmailDestination(action.target.destination)
    case 'webhook-host':
      return normalizeNetworkHost(action.target.destination)
    case 'github-org':
      return normalizeGithubOrg(action.target.destination)
    case 'github-repo':
      return normalizeGithubRepo(action.target.destination)
    case 'payment-counterparty':
      return normalizePaymentCounterparty(action.target.destination)
    default:
      return null
  }
}

function matchesDestinationPattern(
  destinationType: IntegrationDestinationType,
  normalizedDestination: string,
  pattern: string,
): boolean {
  const normalizedPattern = normalizeDestinationPattern(destinationType, pattern)

  return normalizedPattern !== null && normalizedDestination === normalizedPattern
}

function matchDestinationGrant(
  grant: DestinationGrant,
  action: IntegrationWriteAction,
  normalizedDestination: string,
): boolean {
  if (grant.accountId !== action.target.accountId) {
    return false
  }

  if (grant.scope !== action.target.scope) {
    return false
  }

  if (grant.targetType !== action.target.destinationType) {
    return false
  }

  return matchesDestinationPattern(
    grant.targetType,
    normalizedDestination,
    grant.targetPattern,
  )
}

export function createActionFingerprint(action: PolicyAction): string {
  const encode = (value: string | number | boolean | undefined): string => {
    const serialized = value === undefined ? 'undefined' : JSON.stringify(value)
    return `${serialized.length}:${serialized}`
  }

  const createFingerprint = (
    fields: ReadonlyArray<readonly [name: string, value: string | number | boolean | undefined]>,
  ): string =>
    [action.type, ...fields.map(([name, value]) => `${name}=${encode(value)}`)].join(
      '|',
    )

  switch (action.type) {
    case 'file.change':
      return createFingerprint([
        ['operation', action.target.operation],
        ['insideWorkspaceRoot', action.target.insideWorkspaceRoot],
        ['path', action.target.path],
      ])
    case 'browser.session':
      return createFingerprint([['persistent', action.target.persistent]])
    case 'network.egress':
      return createFingerprint([
        ['scheme', action.target.scheme],
        ['host', action.target.host],
        ['ipClass', action.target.ipClass],
      ])
    case 'integration.read':
      return createFingerprint([
        ['provider', action.target.provider],
        ['accountId', action.target.accountId],
        ['scope', action.target.scope],
      ])
    case 'integration.write':
      return createFingerprint([
        ['provider', action.target.provider],
        ['accountId', action.target.accountId],
        ['scope', action.target.scope],
        ['destinationType', action.target.destinationType],
        ['destination', action.target.destination],
        ['spendCents', action.target.spendCents],
      ])
    default:
      return `unknown:${String((action as { type?: unknown }).type ?? 'missing')}`
  }
}

function allow(reason: string): PolicyEvaluationResult {
  return { decision: 'allow', reason }
}

function deny(reason: string): PolicyEvaluationResult {
  return { decision: 'deny', reason }
}

function pause(action: PolicyAction, reason: string): PolicyEvaluationResult {
  return {
    decision: 'pause_for_exception',
    reason,
    targetFingerprint: createActionFingerprint(action),
  }
}

function hasMatchingException(
  input: PolicyEvaluationInput,
  fingerprint: string,
): boolean {
  const { action, agentType, matchingException } = input

  return (
    matchingException !== null &&
    matchingException !== undefined &&
    matchingException.consumedAt === null &&
    matchingException.agentType === agentType &&
    matchingException.actionType === action.type &&
    matchingException.targetFingerprint === fingerprint
  )
}

function applyMatchingException(
  result: PolicyEvaluationResult,
  input: PolicyEvaluationInput,
  fingerprint: string,
): PolicyEvaluationResult {
  if (result.decision !== 'pause_for_exception') {
    return result
  }

  if (hasMatchingException(input, fingerprint)) {
    return allow('matching single-action exception found')
  }

  return result
}

export function evaluatePolicyAction(
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  const { action, agentType, policy } = input
  const fingerprint = createActionFingerprint(action)
  let result: PolicyEvaluationResult

  switch (action.type) {
    case 'file.change': {
      if (!action.target.insideWorkspaceRoot) {
        result = pause(action, 'file action targets a path outside the workspace root')
        break
      }

      const effectivePermission = getEffectiveFilePermission(policy, agentType)

      if (effectivePermission === 'read-only') {
        result = pause(action, 'agent is read-only inside the workspace root')
        break
      }

      if (
        effectivePermission === 'no-delete' &&
        (action.target.operation === 'delete' || action.target.operation === 'rename')
      ) {
        result = pause(action, 'agent override blocks destructive file actions')
        break
      }

      result = allow('file action allowed by workspace policy')
      break
    }

    case 'browser.session': {
      if (!action.target.persistent) {
        result = allow('ephemeral browser session is always allowed')
        break
      }

      const override = getOverride(policy, agentType)

      if (
        policy.browserPersistenceDefault === 'persistent' ||
        override.browserPersistence === 'persistent'
      ) {
        result = allow('persistent browser session allowed by policy')
        break
      }

      result = pause(action, 'persistent browser state requires explicit policy opt-in')
      break
    }

    case 'network.egress': {
      const normalizedHost = normalizeNetworkHost(action.target.host)

      if (normalizedHost === null) {
        result = deny('network host is malformed')
        break
      }

      if (action.target.scheme !== 'https') {
        result = deny('only https egress is allowed at launch')
        break
      }

      if (
        action.target.ipClass !== 'public' ||
        isHardBlockedNetworkHost(normalizedHost)
      ) {
        result = deny('localhost and private-network egress are hard blocked')
        break
      }

      if (getDeniedHosts(policy, agentType).has(normalizedHost)) {
        result = deny('host is explicitly denied by policy')
        break
      }

      if (isDeniedByCidr(normalizedHost, getDeniedCidrs(policy, agentType))) {
        result = deny('ip address is covered by a denied CIDR')
        break
      }

      switch (policy.networkEgress.mode) {
        case 'broad-https':
          result = allow('public https egress allowed by policy')
          break
        case 'curated-common':
        case 'allow-list-only':
          result = pause(
            action,
            `network egress mode ${policy.networkEgress.mode} is not supported at launch`,
          )
          break
        default:
          result = deny('unknown network egress mode fails closed')
          break
      }

      break
    }

    case 'integration.read': {
      if (
        !isWellFormedIntegrationProvider(action.target.provider) ||
        !isWellFormedIntegrationScope(action.target.scope)
      ) {
        result = deny('integration provider or scope is malformed')
        break
      }

      const providerPolicy = policy.integrations[action.target.provider]
      const restriction = getIntegrationRestriction(policy, agentType, action.target.provider)

      if (restriction?.denyScopes?.includes(action.target.scope)) {
        result = pause(action, 'agent override denies this integration scope')
        break
      }

      if (!providerPolicy || !providerPolicy.allowedScopes.includes(action.target.scope)) {
        result = pause(action, 'integration read scope is not allowed by workspace policy')
        break
      }

      result = allow('integration read allowed by workspace policy')
      break
    }

    case 'integration.write': {
      if (
        !isWellFormedIntegrationProvider(action.target.provider) ||
        !isWellFormedIntegrationScope(action.target.scope)
      ) {
        result = deny('integration provider or scope is malformed')
        break
      }

      const providerPolicy = policy.integrations[action.target.provider]
      const restriction = getIntegrationRestriction(policy, agentType, action.target.provider)
      const normalizedDestination = normalizeIntegrationDestination(action)

      if (normalizedDestination === null) {
        result = deny(
          `integration destination is malformed for ${action.target.destinationType}`,
        )
        break
      }

      if (restriction?.denyScopes?.includes(action.target.scope)) {
        result = pause(action, 'agent override denies this integration write scope')
        break
      }

      if (!providerPolicy || !providerPolicy.allowedScopes.includes(action.target.scope)) {
        result = pause(action, 'integration write scope is not allowed by workspace policy')
        break
      }

      const matchingGrant = providerPolicy.destinationGrants.find((grant) =>
        matchDestinationGrant(grant, action, normalizedDestination),
      )

      if (!matchingGrant) {
        result = pause(action, 'no destination-bounded grant matches this integration write')
        break
      }

      if (
        action.target.spendCents !== undefined &&
        matchingGrant.spendLimitCents !== undefined &&
        action.target.spendCents > matchingGrant.spendLimitCents
      ) {
        result = pause(action, 'requested spend exceeds the destination grant limit')
        break
      }

      if (
        restriction?.denyDestinationPatterns?.some((pattern) =>
          matchesDestinationPattern(
            action.target.destinationType,
            normalizedDestination,
            pattern,
          ),
        )
      ) {
        result = pause(action, 'agent override denies this destination pattern')
        break
      }

      result = allow('integration write allowed by destination-bounded grant')
      break
    }

    default:
      result = deny('unknown action type fails closed')
      break
  }

  return applyMatchingException(result, input, fingerprint)
}
