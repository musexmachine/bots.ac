import { describe, expect, it } from 'vitest'
import { createActionFingerprint, evaluatePolicyAction } from '../evaluation.ts'
import { createDefaultWorkspacePolicy } from '../validation.ts'
import type { PolicyException, WorkspacePolicyDocument } from '../types.ts'

function buildPolicy(): WorkspacePolicyDocument {
  return {
    ...createDefaultWorkspacePolicy(),
    integrations: {
      gmail: {
        allowedScopes: ['gmail.read', 'gmail.send'],
        destinationGrants: [
          {
            accountId: 'acct_gmail_primary',
            scope: 'gmail.send',
            targetType: 'email-domain',
            targetPattern: 'example.com',
          },
        ],
      },
    },
    agentOverrides: {
      'web-agent': {
        browserPersistence: 'persistent',
      },
      'inbox-agent': {
        integrationRestrictions: {
          gmail: {
            denyScopes: ['gmail.send'],
          },
        },
      },
    },
  }
}

describe('evaluatePolicyAction', () => {
  it('creates stable distinct fingerprints for integration reads with delimiter-like values', () => {
    const withDelimitedAccount = createActionFingerprint({
      type: 'integration.read',
      target: {
        provider: 'gmail',
        accountId: 'acct:primary',
        scope: 'messages.read',
      },
    })

    const withDelimitedProvider = createActionFingerprint({
      type: 'integration.read',
      target: {
        provider: 'gmail:acct',
        accountId: 'primary',
        scope: 'messages.read',
      },
    })

    expect(withDelimitedAccount).not.toBe(withDelimitedProvider)
    expect(
      createActionFingerprint({
        type: 'integration.read',
        target: {
          provider: 'gmail',
          accountId: 'acct:primary',
          scope: 'messages.read',
        },
      }),
    ).toBe(withDelimitedAccount)
  })

  it('allows file writes inside the workspace root by default', () => {
    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'file.change',
        target: {
          path: '/workspace/report.md',
          operation: 'delete',
          insideWorkspaceRoot: true,
        },
      },
    })

    expect(result.decision).toBe('allow')
  })

  it('pauses for file actions outside the workspace root', () => {
    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'file.change',
        target: {
          path: '/etc/hosts',
          operation: 'modify',
          insideWorkspaceRoot: false,
        },
      },
    })

    expect(result.decision).toBe('pause_for_exception')
  })

  it('pause responses expose the target fingerprint', () => {
    const action = {
      type: 'file.change',
      target: {
        path: '/etc/hosts',
        operation: 'modify',
        insideWorkspaceRoot: false,
      },
    } as const

    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action,
    })

    expect(result).toEqual({
      decision: 'pause_for_exception',
      reason: 'file action targets a path outside the workspace root',
      targetFingerprint: createActionFingerprint(action),
    })
  })

  it('denies persistent browser state unless the agent override opted in', () => {
    const denied = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'browser.session',
        target: { persistent: true },
      },
    })

    const allowed = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'web-agent',
      action: {
        type: 'browser.session',
        target: { persistent: true },
      },
    })

    expect(denied.decision).toBe('pause_for_exception')
    expect(allowed.decision).toBe('allow')
  })

  it('hard-denies localhost and private-network egress', () => {
    const localhost = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'web-agent',
      action: {
        type: 'network.egress',
        target: {
          scheme: 'https',
          host: 'localhost',
          ipClass: 'localhost',
        },
      },
    })

    const privateIp = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'web-agent',
      action: {
        type: 'network.egress',
        target: {
          scheme: 'https',
          host: '10.0.0.5',
          ipClass: 'private',
        },
      },
    })

    expect(localhost.decision).toBe('deny')
    expect(privateIp.decision).toBe('deny')
  })

  it('denies public IP egress when workspace or agent denyCidrs cover the target', () => {
    const workspacePolicy = buildPolicy()
    const overridePolicy = buildPolicy()

    const workspaceDenied = evaluatePolicyAction({
      policy: {
        ...workspacePolicy,
        networkEgress: {
          ...workspacePolicy.networkEgress,
          denyCidrs: ['203.0.113.0/24'],
        },
      },
      agentType: 'code-agent',
      action: {
        type: 'network.egress',
        target: {
          scheme: 'https',
          host: '203.0.113.42',
          ipClass: 'public',
        },
      },
    })

    const overrideDenied = evaluatePolicyAction({
      policy: {
        ...overridePolicy,
        networkEgress: {
          ...overridePolicy.networkEgress,
          denyCidrs: [],
        },
        agentOverrides: {
          ...overridePolicy.agentOverrides,
          'web-agent': {
            ...overridePolicy.agentOverrides['web-agent'],
            networkRestrictions: {
              denyCidrs: ['198.51.100.0/24'],
            },
          },
        },
      },
      agentType: 'web-agent',
      action: {
        type: 'network.egress',
        target: {
          scheme: 'https',
          host: '198.51.100.17',
          ipClass: 'public',
        },
      },
    })

    expect(workspaceDenied).toEqual({
      decision: 'deny',
      reason: 'ip address is covered by a denied CIDR',
    })
    expect(overrideDenied).toEqual({
      decision: 'deny',
      reason: 'ip address is covered by a denied CIDR',
    })
  })

  it('matches denyHosts against canonical IP literals instead of raw spellings', () => {
    const result = evaluatePolicyAction({
      policy: {
        ...buildPolicy(),
        networkEgress: {
          ...buildPolicy().networkEgress,
          denyHosts: [...buildPolicy().networkEgress.denyHosts, '203.0.113.42'],
        },
      },
      agentType: 'web-agent',
      action: {
        type: 'network.egress',
        target: {
          scheme: 'https',
          host: '203.000.113.042',
          ipClass: 'public',
        },
      },
    })

    expect(result).toEqual({
      decision: 'deny',
      reason: 'host is explicitly denied by policy',
    })
  })

  it('denies malformed network hosts before policy matching', () => {
    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'web-agent',
      action: {
        type: 'network.egress',
        target: {
          scheme: 'https',
          host: '999.0.0.1',
          ipClass: 'public',
        },
      },
    })

    expect(result).toEqual({
      decision: 'deny',
      reason: 'network host is malformed',
    })
  })

  it('keeps hard-blocked network egress denied even with a matching exception', () => {
    const action = {
      type: 'network.egress',
      target: {
        scheme: 'http',
        host: 'example.com',
        ipClass: 'public',
      },
    } as const

    const exception: PolicyException = {
      policyExceptionId: 'exc_1',
      workspaceId: 'ws_1',
      runId: 'run_1',
      policyVersionId: 'pv_1',
      agentType: 'code-agent',
      actionType: 'network.egress',
      targetFingerprint: createActionFingerprint(action),
      targetJson: action.target,
      approvedByUserId: 'user_1',
      approvedAt: new Date('2026-04-16T20:00:00.000Z'),
      consumedAt: null,
    }

    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action,
      matchingException: exception,
    })

    expect(result).toEqual({
      decision: 'deny',
      reason: 'only https egress is allowed at launch',
    })
  })

  it('fails closed for stricter network modes that are not supported at launch', () => {
    for (const mode of ['curated-common', 'allow-list-only'] as const) {
      const result = evaluatePolicyAction({
        policy: {
          ...buildPolicy(),
          networkEgress: {
            ...buildPolicy().networkEgress,
            mode,
          },
        },
        agentType: 'web-agent',
        action: {
          type: 'network.egress',
          target: {
            scheme: 'https',
            host: 'example.com',
            ipClass: 'public',
          },
        },
      })

      expect(result).toEqual({
        decision: 'pause_for_exception',
        reason: `network egress mode ${mode} is not supported at launch`,
        targetFingerprint: createActionFingerprint({
          type: 'network.egress',
          target: {
            scheme: 'https',
            host: 'example.com',
            ipClass: 'public',
          },
        }),
      })
    }
  })

  it('hard-denies IPv6 local ranges even when ipClass is misclassified as public', () => {
    for (const host of ['fc00::1', 'fe80::1']) {
      const result = evaluatePolicyAction({
        policy: {
          ...buildPolicy(),
          networkEgress: {
            ...buildPolicy().networkEgress,
            denyCidrs: [],
          },
        },
        agentType: 'web-agent',
        action: {
          type: 'network.egress',
          target: {
            scheme: 'https',
            host,
            ipClass: 'public',
          },
        },
      })

      expect(result).toEqual({
        decision: 'deny',
        reason: 'localhost and private-network egress are hard blocked',
      })
    }
  })

  it('hard-denies IPv4-mapped IPv6 local ranges even when ipClass is misclassified as public', () => {
    const result = evaluatePolicyAction({
      policy: {
        ...buildPolicy(),
        networkEgress: {
          ...buildPolicy().networkEgress,
          denyCidrs: [],
        },
      },
      agentType: 'web-agent',
      action: {
        type: 'network.egress',
        target: {
          scheme: 'https',
          host: '::ffff:127.0.0.1',
          ipClass: 'public',
        },
      },
    })

    expect(result).toEqual({
      decision: 'deny',
      reason: 'localhost and private-network egress are hard blocked',
    })
  })

  it('allows integration writes only when the destination grant matches', () => {
    const allowed = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'integration.write',
        target: {
          provider: 'gmail',
          accountId: 'acct_gmail_primary',
          scope: 'gmail.send',
          destinationType: 'email-domain',
          destination: 'ops@example.com',
        },
      },
    })

    const blocked = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'integration.write',
        target: {
          provider: 'gmail',
          accountId: 'acct_gmail_primary',
          scope: 'gmail.send',
          destinationType: 'email-domain',
          destination: 'ops@outside.com',
        },
      },
    })

    expect(allowed.decision).toBe('allow')
    expect(blocked.decision).toBe('pause_for_exception')
  })

  it('denies malformed integration provider or scope values', () => {
    const malformedRead = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'integration.read',
        target: {
          provider: 'gmail provider',
          accountId: 'acct_gmail_primary',
          scope: 'gmail.read',
        },
      },
    })

    const malformedWrite = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'integration.write',
        target: {
          provider: 'gmail',
          accountId: 'acct_gmail_primary',
          scope: 'gmail send',
          destinationType: 'email-domain',
          destination: 'ops@example.com',
        },
      },
    })

    expect(malformedRead).toEqual({
      decision: 'deny',
      reason: 'integration provider or scope is malformed',
    })
    expect(malformedWrite).toEqual({
      decision: 'deny',
      reason: 'integration provider or scope is malformed',
    })
  })

  it('denies malformed email destinations instead of treating them as unmatched', () => {
    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'integration.write',
        target: {
          provider: 'gmail',
          accountId: 'acct_gmail_primary',
          scope: 'gmail.send',
          destinationType: 'email-domain',
          destination: 'ops.example.com',
        },
      },
    })

    expect(result).toEqual({
      decision: 'deny',
      reason: 'integration destination is malformed for email-domain',
    })
  })

  it('matches denyDestinationPatterns against the narrowed email domain', () => {
    const action = {
      type: 'integration.write',
      target: {
        provider: 'gmail',
        accountId: 'acct_gmail_primary',
        scope: 'gmail.send',
        destinationType: 'email-domain',
        destination: 'ops@example.com',
      },
    } as const

    const result = evaluatePolicyAction({
      policy: {
        ...buildPolicy(),
        agentOverrides: {
          ...buildPolicy().agentOverrides,
          'code-agent': {
            integrationRestrictions: {
              gmail: {
                denyDestinationPatterns: ['example.com'],
              },
            },
          },
        },
      },
      agentType: 'code-agent',
      action,
    })

    expect(result).toEqual({
      decision: 'pause_for_exception',
      reason: 'agent override denies this destination pattern',
      targetFingerprint: createActionFingerprint(action),
    })
  })

  it('pauses when a destination-bounded grant spend limit would be exceeded', () => {
    const policy = buildPolicy()
    policy.integrations.gmail.destinationGrants[0] = {
      ...policy.integrations.gmail.destinationGrants[0],
      spendLimitCents: 500,
    }

    const result = evaluatePolicyAction({
      policy,
      agentType: 'code-agent',
      action: {
        type: 'integration.write',
        target: {
          provider: 'gmail',
          accountId: 'acct_gmail_primary',
          scope: 'gmail.send',
          destinationType: 'email-domain',
          destination: 'ops@example.com',
          spendCents: 750,
        },
      },
    })

    expect(result).toEqual({
      decision: 'pause_for_exception',
      reason: 'requested spend exceeds the destination grant limit',
      targetFingerprint: createActionFingerprint({
        type: 'integration.write',
        target: {
          provider: 'gmail',
          accountId: 'acct_gmail_primary',
          scope: 'gmail.send',
          destinationType: 'email-domain',
          destination: 'ops@example.com',
          spendCents: 750,
        },
      }),
    })
  })

  it('allows a blocked action when an exact matching exception exists', () => {
    const action = {
      type: 'file.change',
      target: {
        path: '/etc/hosts',
        operation: 'modify',
        insideWorkspaceRoot: false,
      },
    } as const

    const exception: PolicyException = {
      policyExceptionId: 'exc_1',
      workspaceId: 'ws_1',
      runId: 'run_1',
      policyVersionId: 'pv_1',
      agentType: 'code-agent',
      actionType: 'file.change',
      targetFingerprint: createActionFingerprint(action),
      targetJson: action.target,
      approvedByUserId: 'user_1',
      approvedAt: new Date('2026-04-16T20:00:00.000Z'),
      consumedAt: null,
    }

    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action,
      matchingException: exception,
    })

    expect(result.decision).toBe('allow')
  })

  it('does not apply a consumed exception again', () => {
    const action = {
      type: 'file.change',
      target: {
        path: '/etc/hosts',
        operation: 'modify',
        insideWorkspaceRoot: false,
      },
    } as const

    const exception: PolicyException = {
      policyExceptionId: 'exc_2',
      workspaceId: 'ws_1',
      runId: 'run_1',
      policyVersionId: 'pv_1',
      agentType: 'code-agent',
      actionType: 'file.change',
      targetFingerprint: createActionFingerprint(action),
      targetJson: action.target,
      approvedByUserId: 'user_1',
      approvedAt: new Date('2026-04-16T20:00:00.000Z'),
      consumedAt: new Date('2026-04-16T20:01:00.000Z'),
    }

    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action,
      matchingException: exception,
    })

    expect(result).toEqual({
      decision: 'pause_for_exception',
      reason: 'file action targets a path outside the workspace root',
      targetFingerprint: createActionFingerprint(action),
    })
  })

  it('denies unknown actions instead of returning undefined', () => {
    const result = evaluatePolicyAction({
      policy: buildPolicy(),
      agentType: 'code-agent',
      action: {
        type: 'unknown.action',
        target: {},
      } as unknown as Parameters<typeof evaluatePolicyAction>[0]['action'],
    })

    expect(result).toEqual({
      decision: 'deny',
      reason: 'unknown action type fails closed',
    })
  })
})
