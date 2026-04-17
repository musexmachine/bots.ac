import { describe, expect, it } from 'vitest'
import { WorkspacePolicyValidationError } from '../errors.ts'
import {
  createDefaultWorkspacePolicy,
  validateWorkspacePolicyDocument,
} from '../validation.ts'

describe('createDefaultWorkspacePolicy', () => {
  it('matches the launch defaults chosen in the design', () => {
    const policy = createDefaultWorkspacePolicy()

    expect(policy.browserPersistenceDefault).toBe('ephemeral')
    expect(policy.filePermissions.insideWorkspaceRoot).toBe('full')
    expect(policy.filePermissions.outsideWorkspaceRoot).toBe('exception-required')
    expect(policy.networkEgress.mode).toBe('broad-https')
    expect(policy.networkEgress.denyHosts).toContain('localhost')
    expect(policy.networkEgress.denyCidrs).toContain('fe80::/10')
  })
})

describe('validateWorkspacePolicyDocument', () => {
  it('accepts a valid default policy', () => {
    expect(validateWorkspacePolicyDocument(createDefaultWorkspacePolicy())).toEqual(
      createDefaultWorkspacePolicy(),
    )
  })

  it('rejects unknown top-level policy keys', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        unexpected: true,
      }),
    ).toThrowError('workspace policy contains unknown field: unexpected')
  })

  it('rejects unknown agent override keys', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        agentOverrides: {
          'made-up-agent': {
            browserPersistence: 'persistent',
          },
        },
      }),
    ).toThrowError(WorkspacePolicyValidationError)
  })

  it('rejects unknown integration config keys', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        integrations: {
          gmail: {
            allowedScopes: ['gmail.send'],
            destinationGrants: [],
            unexpected: true,
          },
        },
      }),
    ).toThrowError('gmail integration config contains unknown field: unexpected')
  })

  it('rejects unknown filePermissions keys', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        filePermissions: {
          ...createDefaultWorkspacePolicy().filePermissions,
          unexpected: true,
        },
      }),
    ).toThrowError('filePermissions contains unknown field: unexpected')
  })

  it('rejects unknown networkEgress keys', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        networkEgress: {
          ...createDefaultWorkspacePolicy().networkEgress,
          unexpected: true,
        },
      }),
    ).toThrowError('networkEgress contains unknown field: unexpected')
  })

  it('rejects file overrides that broaden workspace permissions', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        filePermissions: {
          insideWorkspaceRoot: 'no-delete',
          outsideWorkspaceRoot: 'exception-required',
        },
        agentOverrides: {
          'code-agent': {
            filePermissions: {
              insideWorkspaceRoot: 'full',
            },
          },
        },
      }),
    ).toThrowError(WorkspacePolicyValidationError)
  })

  it('rejects typoed agent override fields', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        agentOverrides: {
          'code-agent': {
            browserPersistance: 'persistent',
          },
        },
      }),
    ).toThrowError('agent override contains unknown field: browserPersistance')
  })

  it('rejects typoed nested network restriction fields', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        agentOverrides: {
          'code-agent': {
            networkRestrictions: {
              denyHost: ['example.com'],
            },
          },
        },
      }),
    ).toThrowError(
      'agent networkRestrictions contains unknown field: denyHost',
    )
  })

  it('rejects typoed nested integration restriction fields', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        agentOverrides: {
          'code-agent': {
            integrationRestrictions: {
              github: {
                denyScope: ['repo:write'],
              },
            },
          },
        },
      }),
    ).toThrowError(
      'github integration restriction contains unknown field: denyScope',
    )
  })

  it('rejects malformed denyDestinationPatterns for the provider destination type', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        integrations: {
          gmail: {
            allowedScopes: ['gmail.send'],
            destinationGrants: [
              {
                accountId: 'acct_1',
                scope: 'gmail.send',
                targetType: 'email-domain',
                targetPattern: 'example.com',
              },
            ],
          },
        },
        agentOverrides: {
          'code-agent': {
            integrationRestrictions: {
              gmail: {
                denyDestinationPatterns: ['@example.com'],
              },
            },
          },
        },
      }),
    ).toThrowError(
      'gmail denyDestinationPatterns contains invalid destination pattern for email-domain: @example.com',
    )
  })

  it('rejects empty strings in string arrays', () => {
    const policy = createDefaultWorkspacePolicy()

    expect(() =>
      validateWorkspacePolicyDocument({
        ...policy,
        networkEgress: {
          ...policy.networkEgress,
          denyHosts: [''],
        },
      }),
    ).toThrowError('networkEgress.denyHosts must be a string array')
  })

  it('rejects invalid denyHosts in workspace and agent overrides', () => {
    const policy = createDefaultWorkspacePolicy()

    expect(() =>
      validateWorkspacePolicyDocument({
        ...policy,
        networkEgress: {
          ...policy.networkEgress,
          denyHosts: ['localhost '],
        },
      }),
    ).toThrowError('networkEgress.denyHosts contains invalid host: localhost ')

    expect(() =>
      validateWorkspacePolicyDocument({
        ...policy,
        agentOverrides: {
          'code-agent': {
            networkRestrictions: {
              denyHosts: ['not a host'],
            },
          },
        },
      }),
    ).toThrowError('agent denyHosts contains invalid host: not a host')
  })

  it('rejects invalid denyCidrs in workspace and agent overrides', () => {
    const policy = createDefaultWorkspacePolicy()

    expect(() =>
      validateWorkspacePolicyDocument({
        ...policy,
        networkEgress: {
          ...policy.networkEgress,
          denyCidrs: ['203.0.113.0/nope'],
        },
      }),
    ).toThrowError(
      'networkEgress.denyCidrs contains invalid CIDR: 203.0.113.0/nope',
    )

    expect(() =>
      validateWorkspacePolicyDocument({
        ...policy,
        agentOverrides: {
          'code-agent': {
            networkRestrictions: {
              denyCidrs: ['not-a-cidr'],
            },
          },
        },
      }),
    ).toThrowError('agent denyCidrs contains invalid CIDR: not-a-cidr')
  })

  it('rejects invalid destination grants', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        integrations: {
          gmail: {
            allowedScopes: ['gmail.send'],
            destinationGrants: [
              {
                accountId: 'acct_1',
                scope: 'gmail.send',
                targetType: 'not-a-real-type',
                targetPattern: '@example.com',
              },
            ],
          },
        },
      }),
    ).toThrowError(WorkspacePolicyValidationError)
  })

  it('rejects malformed destination grant target patterns for the declared type', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        integrations: {
          gmail: {
            allowedScopes: ['gmail.send'],
            destinationGrants: [
              {
                accountId: 'acct_1',
                scope: 'gmail.send',
                targetType: 'email-domain',
                targetPattern: '@example.com',
              },
            ],
          },
        },
      }),
    ).toThrowError(
      'destination grant targetPattern is malformed for email-domain',
    )
  })

  it('rejects duplicate destination grants after normalization', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        integrations: {
          gmail: {
            allowedScopes: ['gmail.send'],
            destinationGrants: [
              {
                accountId: 'acct_1',
                scope: 'gmail.send',
                targetType: 'email-domain',
                targetPattern: 'Example.com',
                spendLimitCents: 1000,
              },
              {
                accountId: 'acct_1',
                scope: 'gmail.send',
                targetType: 'email-domain',
                targetPattern: 'example.com',
                spendLimitCents: 500,
              },
            ],
          },
        },
      }),
    ).toThrowError(
      'gmail destinationGrants contains duplicate grant for gmail.send email-domain example.com',
    )
  })

  it('rejects unknown destination grant keys', () => {
    expect(() =>
      validateWorkspacePolicyDocument({
        ...createDefaultWorkspacePolicy(),
        integrations: {
          gmail: {
            allowedScopes: ['gmail.send'],
            destinationGrants: [
              {
                accountId: 'acct_1',
                scope: 'gmail.send',
                targetType: 'email-domain',
                targetPattern: 'example.com',
                unexpected: true,
              },
            ],
          },
        },
      }),
    ).toThrowError('destination grant contains unknown field: unexpected')
  })
})
