# f-workspace-policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the core workspace policy foundation: immutable policy versions, a pure policy evaluator, and owner-approved single-action exceptions.

**Architecture:** Store canonical policy versions and exception rows in Postgres, but keep the runtime evaluator pure TypeScript. A small service layer orchestrates owner checks, version increments, and exception lifecycle through a repository interface because the repo does not yet have a settled API/runtime DB boundary. Every guarded subsystem will later call the same evaluator and get one of three outcomes: `allow`, `deny`, or `pause_for_exception`.

**Tech Stack:** TypeScript, PostgreSQL SQL migrations, Vitest, Node.js 20+. No new runtime dependencies.

**Design doc:** `docs/superpowers/specs/2026-04-16-f-workspace-policy-design.md`

---

## File Structure

```text
src/
  lib/
    workspace-policy/
      index.ts
      types.ts
      errors.ts
      validation.ts
      evaluation.ts
      service.ts
      __tests__/
        errors.test.ts
        validation.test.ts
        evaluation.test.ts
        service.test.ts
db/
  migrations/
    0002_workspace_policy.sql
```

---

## Task 1: Add the DB primitives for policy versions and exceptions

**Files:**
- Create: `db/migrations/0002_workspace_policy.sql`

- [ ] **Step 1: Write `db/migrations/0002_workspace_policy.sql`**

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS workspace_policy_versions (
  policy_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  policy_json JSONB NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_policy_version_id UUID,
  UNIQUE (workspace_id, version),
  UNIQUE (workspace_id, policy_version_id),
  FOREIGN KEY (workspace_id, supersedes_policy_version_id)
    REFERENCES workspace_policy_versions (workspace_id, policy_version_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_policy_versions_workspace_created_at
  ON workspace_policy_versions (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_policy_exceptions (
  policy_exception_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL,
  policy_version_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_fingerprint TEXT NOT NULL,
  target_json JSONB NOT NULL,
  approved_by_user_id UUID NOT NULL REFERENCES users(user_id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  CHECK (target_fingerprint <> ''),
  FOREIGN KEY (workspace_id, policy_version_id)
    REFERENCES workspace_policy_versions (workspace_id, policy_version_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_policy_exceptions_active_run_target
  ON workspace_policy_exceptions (run_id, target_fingerprint)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_policy_exceptions_run_lookup
  ON workspace_policy_exceptions (run_id, target_fingerprint, consumed_at);

COMMIT;
```

- [ ] **Step 2: Verify the migration contains the two expected tables**

Run:

```bash
rg -n "workspace_policy_versions|workspace_policy_exceptions" db/migrations/0002_workspace_policy.sql
```

Expected: the command returns the two `CREATE TABLE` lines plus any related FK/index references in the migration. Do not rely on an exact match count here.

- [ ] **Step 3: Apply the migration if your Supabase/Postgres environment is connected**

Run:

```bash
npx supabase db push
```

Expected: the migration applies cleanly. If the CLI is not configured in this environment, record that and continue; the SQL file is still the source of truth.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0002_workspace_policy.sql
git commit -m "feat: add workspace policy DB primitives"
```

---

## Task 2: Define policy types and error classes

**Files:**
- Create: `src/lib/workspace-policy/types.ts`
- Create: `src/lib/workspace-policy/errors.ts`
- Create: `src/lib/workspace-policy/__tests__/errors.test.ts`

- [ ] **Step 1: Write the failing error test**

Create `src/lib/workspace-policy/__tests__/errors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  PolicyPermissionError,
  WorkspacePolicyValidationError,
} from '../errors.ts'

describe('WorkspacePolicyValidationError', () => {
  it('exposes a 400 status code', () => {
    const error = new WorkspacePolicyValidationError('invalid policy document')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('WorkspacePolicyValidationError')
    expect(error.message).toBe('invalid policy document')
  })
})

describe('PolicyPermissionError', () => {
  it('exposes a 403 status code', () => {
    const error = new PolicyPermissionError('owner role required')
    expect(error.statusCode).toBe(403)
    expect(error.name).toBe('PolicyPermissionError')
    expect(error.message).toBe('owner role required')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/workspace-policy/__tests__/errors.test.ts
```

Expected: FAIL with `Cannot find module '../errors.ts'`.

- [ ] **Step 3: Write `src/lib/workspace-policy/errors.ts`**

```typescript
export class WorkspacePolicyValidationError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'WorkspacePolicyValidationError'
  }
}

export class PolicyPermissionError extends Error {
  readonly statusCode = 403

  constructor(message = 'Workspace owner role required') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'PolicyPermissionError'
  }
}
```

- [ ] **Step 4: Write `src/lib/workspace-policy/types.ts`**

```typescript
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

export type PolicyException = {
  policyExceptionId: string
  workspaceId: string
  runId: string
  policyVersionId: string
  agentType: BuiltInAgentType
  actionType: PolicyAction['type']
  targetFingerprint: string
  targetJson: PolicyAction['target']
  approvedByUserId: string
  approvedAt: Date
  consumedAt: Date | null
}

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
```

- [ ] **Step 5: Re-run the error test**

```bash
npx vitest run src/lib/workspace-policy/__tests__/errors.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workspace-policy/types.ts src/lib/workspace-policy/errors.ts src/lib/workspace-policy/__tests__/errors.test.ts
git commit -m "feat: add workspace policy types and errors"
```

---

## Task 3: Implement policy validation and the launch default policy

**Files:**
- Create: `src/lib/workspace-policy/validation.ts`
- Create: `src/lib/workspace-policy/__tests__/validation.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Create `src/lib/workspace-policy/__tests__/validation.test.ts`:

```typescript
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
  })
})

describe('validateWorkspacePolicyDocument', () => {
  it('accepts a valid default policy', () => {
    expect(validateWorkspacePolicyDocument(createDefaultWorkspacePolicy())).toEqual(
      createDefaultWorkspacePolicy(),
    )
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
})
```

- [ ] **Step 2: Run the validation test to confirm it fails**

```bash
npx vitest run src/lib/workspace-policy/__tests__/validation.test.ts
```

Expected: FAIL with `Cannot find module '../validation.ts'`.

- [ ] **Step 3: Write `src/lib/workspace-policy/validation.ts`**

```typescript
import {
  BUILT_IN_AGENT_TYPES,
  DESTINATION_TARGET_TYPES,
  type AgentPolicyOverride,
  type DestinationGrant,
  type WorkspacePolicyDocument,
} from './types.ts'
import { WorkspacePolicyValidationError } from './errors.ts'

const FILE_PERMISSION_RANK = {
  'read-only': 0,
  'no-delete': 1,
  full: 2,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WorkspacePolicyValidationError(message)
  }

  return value
}

function assertStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new WorkspacePolicyValidationError(message)
  }

  return value
}

function validateDestinationGrant(input: unknown): DestinationGrant {
  if (!isRecord(input)) {
    throw new WorkspacePolicyValidationError('destination grant must be an object')
  }

  const targetType = assertString(input.targetType, 'destination grant targetType is required')

  if (!DESTINATION_TARGET_TYPES.includes(targetType as (typeof DESTINATION_TARGET_TYPES)[number])) {
    throw new WorkspacePolicyValidationError(`unsupported destination grant targetType: ${targetType}`)
  }

  const spendLimit = input.spendLimitCents

  if (
    spendLimit !== undefined &&
    (!Number.isInteger(spendLimit) || (spendLimit as number) < 0)
  ) {
    throw new WorkspacePolicyValidationError('spendLimitCents must be a positive integer when provided')
  }

  return {
    accountId: assertString(input.accountId, 'destination grant accountId is required'),
    scope: assertString(input.scope, 'destination grant scope is required'),
    targetType: targetType as DestinationGrant['targetType'],
    targetPattern: assertString(input.targetPattern, 'destination grant targetPattern is required'),
    spendLimitCents: spendLimit as number | undefined,
  }
}

function validateAgentOverride(
  input: unknown,
  basePolicy: WorkspacePolicyDocument,
): AgentPolicyOverride {
  if (!isRecord(input)) {
    throw new WorkspacePolicyValidationError('agent override must be an object')
  }

  const override: AgentPolicyOverride = {}

  if (input.browserPersistence !== undefined) {
    if (input.browserPersistence !== 'persistent') {
      throw new WorkspacePolicyValidationError('agent browserPersistence may only opt in to persistent')
    }

    override.browserPersistence = 'persistent'
  }

  if (input.filePermissions !== undefined) {
    if (!isRecord(input.filePermissions)) {
      throw new WorkspacePolicyValidationError('agent filePermissions must be an object')
    }

    const inside = input.filePermissions.insideWorkspaceRoot

    if (inside !== undefined && inside !== 'no-delete' && inside !== 'read-only') {
      throw new WorkspacePolicyValidationError('agent file override must be no-delete or read-only')
    }

    if (
      inside !== undefined &&
      FILE_PERMISSION_RANK[inside] > FILE_PERMISSION_RANK[basePolicy.filePermissions.insideWorkspaceRoot]
    ) {
      throw new WorkspacePolicyValidationError('agent file override cannot broaden workspace permissions')
    }

    override.filePermissions = {
      insideWorkspaceRoot: inside as AgentPolicyOverride['filePermissions'] extends infer T
        ? T extends { insideWorkspaceRoot?: infer U }
          ? U
          : never
        : never,
    }
  }

  if (input.networkRestrictions !== undefined) {
    if (!isRecord(input.networkRestrictions)) {
      throw new WorkspacePolicyValidationError('agent networkRestrictions must be an object')
    }

    override.networkRestrictions = {
      denyHosts:
        input.networkRestrictions.denyHosts === undefined
          ? undefined
          : assertStringArray(input.networkRestrictions.denyHosts, 'agent denyHosts must be a string array'),
      denyCidrs:
        input.networkRestrictions.denyCidrs === undefined
          ? undefined
          : assertStringArray(input.networkRestrictions.denyCidrs, 'agent denyCidrs must be a string array'),
    }
  }

  if (input.integrationRestrictions !== undefined) {
    if (!isRecord(input.integrationRestrictions)) {
      throw new WorkspacePolicyValidationError('agent integrationRestrictions must be an object')
    }

    override.integrationRestrictions = Object.fromEntries(
      Object.entries(input.integrationRestrictions).map(([provider, restriction]) => {
        if (!isRecord(restriction)) {
          throw new WorkspacePolicyValidationError(`integration restriction for ${provider} must be an object`)
        }

        return [
          provider,
          {
            denyScopes:
              restriction.denyScopes === undefined
                ? undefined
                : assertStringArray(restriction.denyScopes, `${provider} denyScopes must be a string array`),
            denyDestinationPatterns:
              restriction.denyDestinationPatterns === undefined
                ? undefined
                : assertStringArray(
                    restriction.denyDestinationPatterns,
                    `${provider} denyDestinationPatterns must be a string array`,
                  ),
          },
        ]
      }),
    )
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
      ],
    },
    integrations: {},
    agentOverrides: {},
  }
}

export function validateWorkspacePolicyDocument(input: unknown): WorkspacePolicyDocument {
  if (!isRecord(input)) {
    throw new WorkspacePolicyValidationError('workspace policy document must be an object')
  }

  const browserPersistenceDefault = assertString(
    input.browserPersistenceDefault,
    'browserPersistenceDefault is required',
  )

  if (browserPersistenceDefault !== 'ephemeral' && browserPersistenceDefault !== 'persistent') {
    throw new WorkspacePolicyValidationError('browserPersistenceDefault must be ephemeral or persistent')
  }

  if (!isRecord(input.filePermissions)) {
    throw new WorkspacePolicyValidationError('filePermissions is required')
  }

  const insideWorkspaceRoot = assertString(
    input.filePermissions.insideWorkspaceRoot,
    'filePermissions.insideWorkspaceRoot is required',
  )

  if (insideWorkspaceRoot !== 'full' && insideWorkspaceRoot !== 'no-delete' && insideWorkspaceRoot !== 'read-only') {
    throw new WorkspacePolicyValidationError('unsupported file permission for insideWorkspaceRoot')
  }

  const outsideWorkspaceRoot = assertString(
    input.filePermissions.outsideWorkspaceRoot,
    'filePermissions.outsideWorkspaceRoot is required',
  )

  if (outsideWorkspaceRoot !== 'exception-required') {
    throw new WorkspacePolicyValidationError('outsideWorkspaceRoot must stay exception-required at launch')
  }

  if (!isRecord(input.networkEgress)) {
    throw new WorkspacePolicyValidationError('networkEgress is required')
  }

  const networkMode = assertString(input.networkEgress.mode, 'networkEgress.mode is required')

  if (
    networkMode !== 'broad-https' &&
    networkMode !== 'curated-common' &&
    networkMode !== 'allow-list-only'
  ) {
    throw new WorkspacePolicyValidationError('unsupported networkEgress.mode')
  }

  const basePolicy: WorkspacePolicyDocument = {
    browserPersistenceDefault: browserPersistenceDefault as WorkspacePolicyDocument['browserPersistenceDefault'],
    filePermissions: {
      insideWorkspaceRoot: insideWorkspaceRoot as WorkspacePolicyDocument['filePermissions']['insideWorkspaceRoot'],
      outsideWorkspaceRoot: 'exception-required',
    },
    networkEgress: {
      mode: networkMode as WorkspacePolicyDocument['networkEgress']['mode'],
      denyHosts: assertStringArray(input.networkEgress.denyHosts, 'networkEgress.denyHosts must be a string array'),
      denyCidrs: assertStringArray(input.networkEgress.denyCidrs, 'networkEgress.denyCidrs must be a string array'),
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
        throw new WorkspacePolicyValidationError(`integration config for ${provider} must be an object`)
      }

      if (!Array.isArray(grantConfig.destinationGrants)) {
        throw new WorkspacePolicyValidationError(`${provider} destinationGrants must be an array`)
      }

      return [
        provider,
        {
          allowedScopes: assertStringArray(grantConfig.allowedScopes, `${provider} allowedScopes must be a string array`),
          destinationGrants: grantConfig.destinationGrants.map(validateDestinationGrant),
        },
      ]
    }),
  )

  if (!isRecord(input.agentOverrides)) {
    throw new WorkspacePolicyValidationError('agentOverrides must be an object')
  }

  basePolicy.agentOverrides = Object.fromEntries(
    Object.entries(input.agentOverrides).map(([agentType, override]) => {
      if (!BUILT_IN_AGENT_TYPES.includes(agentType as (typeof BUILT_IN_AGENT_TYPES)[number])) {
        throw new WorkspacePolicyValidationError(`unsupported agent override key: ${agentType}`)
      }

      return [agentType, validateAgentOverride(override, basePolicy)]
    }),
  )

  return basePolicy
}
```

- [ ] **Step 4: Run the validation test**

```bash
npx vitest run src/lib/workspace-policy/__tests__/validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-policy/validation.ts src/lib/workspace-policy/__tests__/validation.test.ts
git commit -m "feat: add workspace policy validation"
```

---

## Task 4: Implement the pure policy evaluator

**Files:**
- Create: `src/lib/workspace-policy/evaluation.ts`
- Create: `src/lib/workspace-policy/__tests__/evaluation.test.ts`

- [ ] **Step 1: Write the failing evaluator tests**

Create `src/lib/workspace-policy/__tests__/evaluation.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { evaluatePolicyAction } from '../evaluation.ts'
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

  it('allows a blocked action when an exact matching exception exists', () => {
    const exception: PolicyException = {
      policyExceptionId: 'exc_1',
      workspaceId: 'ws_1',
      runId: 'run_1',
      policyVersionId: 'pv_1',
      agentType: 'code-agent',
      actionType: 'file.change',
      targetFingerprint: 'file.change:modify:outside:/etc/hosts',
      targetJson: {
        path: '/etc/hosts',
        operation: 'modify',
        insideWorkspaceRoot: false,
      },
      approvedByUserId: 'user_1',
      approvedAt: new Date('2026-04-16T20:00:00.000Z'),
      consumedAt: null,
    }

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
      matchingException: exception,
    })

    expect(result.decision).toBe('allow')
  })
})
```

- [ ] **Step 2: Run the evaluator tests to confirm they fail**

```bash
npx vitest run src/lib/workspace-policy/__tests__/evaluation.test.ts
```

Expected: FAIL with `Cannot find module '../evaluation.ts'`.

- [ ] **Step 3: Write `src/lib/workspace-policy/evaluation.ts`**

```typescript
import type {
  AgentPolicyOverride,
  DestinationGrant,
  IntegrationWriteAction,
  PolicyAction,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  WorkspacePolicyDocument,
} from './types.ts'

function createFilePermissionRank(permission: WorkspacePolicyDocument['filePermissions']['insideWorkspaceRoot']): number {
  switch (permission) {
    case 'read-only':
      return 0
    case 'no-delete':
      return 1
    case 'full':
      return 2
  }
}

function getOverride(policy: WorkspacePolicyDocument, agentType: PolicyEvaluationInput['agentType']): AgentPolicyOverride {
  return policy.agentOverrides[agentType] ?? {}
}

function getEffectiveFilePermission(policy: WorkspacePolicyDocument, agentType: PolicyEvaluationInput['agentType']) {
  const overrideValue = getOverride(policy, agentType).filePermissions?.insideWorkspaceRoot

  if (!overrideValue) {
    return policy.filePermissions.insideWorkspaceRoot
  }

  return createFilePermissionRank(overrideValue) < createFilePermissionRank(policy.filePermissions.insideWorkspaceRoot)
    ? overrideValue
    : policy.filePermissions.insideWorkspaceRoot
}

function getDeniedHosts(policy: WorkspacePolicyDocument, agentType: PolicyEvaluationInput['agentType']) {
  const overrideHosts = getOverride(policy, agentType).networkRestrictions?.denyHosts ?? []
  return new Set([...policy.networkEgress.denyHosts, ...overrideHosts])
}

function getIntegrationRestriction(
  policy: WorkspacePolicyDocument,
  agentType: PolicyEvaluationInput['agentType'],
  provider: string,
) {
  return getOverride(policy, agentType).integrationRestrictions?.[provider]
}

function matchDestinationGrant(
  grant: DestinationGrant,
  action: IntegrationWriteAction,
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

  switch (grant.targetType) {
    case 'email-domain': {
      const [, domain = ''] = action.target.destination.split('@')
      return domain.toLowerCase() === grant.targetPattern.toLowerCase()
    }
    case 'webhook-host':
    case 'github-org':
    case 'github-repo':
    case 'payment-counterparty':
      return action.target.destination === grant.targetPattern
  }
}

export function createActionFingerprint(action: PolicyAction): string {
  switch (action.type) {
    case 'file.change':
      return `file.change:${action.target.operation}:${action.target.insideWorkspaceRoot ? 'inside' : 'outside'}:${action.target.path}`
    case 'browser.session':
      return `browser.session:${action.target.persistent ? 'persistent' : 'ephemeral'}`
    case 'network.egress':
      return `network.egress:${action.target.scheme}:${action.target.host}:${action.target.ipClass}`
    case 'integration.read':
      return `integration.read:${action.target.provider}:${action.target.accountId}:${action.target.scope}`
    case 'integration.write':
      return `integration.write:${action.target.provider}:${action.target.accountId}:${action.target.scope}:${action.target.destinationType}:${action.target.destination}:${action.target.spendCents ?? ''}`
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

export function evaluatePolicyAction(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const { action, agentType, matchingException, policy } = input
  const fingerprint = createActionFingerprint(action)

  if (
    matchingException &&
    matchingException.consumedAt === null &&
    matchingException.agentType === agentType &&
    matchingException.actionType === action.type &&
    matchingException.targetFingerprint === fingerprint
  ) {
    return allow('matching single-action exception found')
  }

  switch (action.type) {
    case 'file.change': {
      if (!action.target.insideWorkspaceRoot) {
        return pause(action, 'file action targets a path outside the workspace root')
      }

      const effectivePermission = getEffectiveFilePermission(policy, agentType)

      if (effectivePermission === 'read-only') {
        return pause(action, 'agent is read-only inside the workspace root')
      }

      if (
        effectivePermission === 'no-delete' &&
        (action.target.operation === 'delete' || action.target.operation === 'rename')
      ) {
        return pause(action, 'agent override blocks destructive file actions')
      }

      return allow('file action allowed by workspace policy')
    }

    case 'browser.session': {
      if (!action.target.persistent) {
        return allow('ephemeral browser session is always allowed')
      }

      const override = getOverride(policy, agentType)

      if (
        policy.browserPersistenceDefault === 'persistent' ||
        override.browserPersistence === 'persistent'
      ) {
        return allow('persistent browser session allowed by policy')
      }

      return pause(action, 'persistent browser state requires explicit policy opt-in')
    }

    case 'network.egress': {
      if (action.target.scheme !== 'https') {
        return deny('only https egress is allowed at launch')
      }

      if (action.target.ipClass !== 'public') {
        return deny('localhost and private-network egress are hard blocked')
      }

      if (getDeniedHosts(policy, agentType).has(action.target.host)) {
        return deny('host is explicitly denied by policy')
      }

      return allow('public https egress allowed by policy')
    }

    case 'integration.read': {
      const providerPolicy = policy.integrations[action.target.provider]
      const restriction = getIntegrationRestriction(policy, agentType, action.target.provider)

      if (restriction?.denyScopes?.includes(action.target.scope)) {
        return pause(action, 'agent override denies this integration scope')
      }

      if (!providerPolicy || !providerPolicy.allowedScopes.includes(action.target.scope)) {
        return pause(action, 'integration read scope is not allowed by workspace policy')
      }

      return allow('integration read allowed by workspace policy')
    }

    case 'integration.write': {
      const providerPolicy = policy.integrations[action.target.provider]
      const restriction = getIntegrationRestriction(policy, agentType, action.target.provider)

      if (restriction?.denyScopes?.includes(action.target.scope)) {
        return pause(action, 'agent override denies this integration write scope')
      }

      if (!providerPolicy || !providerPolicy.allowedScopes.includes(action.target.scope)) {
        return pause(action, 'integration write scope is not allowed by workspace policy')
      }

      const matchingGrant = providerPolicy.destinationGrants.find((grant) =>
        matchDestinationGrant(grant, action),
      )

      if (!matchingGrant) {
        return pause(action, 'no destination-bounded grant matches this integration write')
      }

      if (
        action.target.spendCents !== undefined &&
        matchingGrant.spendLimitCents !== undefined &&
        action.target.spendCents > matchingGrant.spendLimitCents
      ) {
        return pause(action, 'requested spend exceeds the destination grant limit')
      }

      if (
        restriction?.denyDestinationPatterns?.includes(action.target.destination)
      ) {
        return pause(action, 'agent override denies this destination pattern')
      }

      return allow('integration write allowed by destination-bounded grant')
    }
  }
}
```

- [ ] **Step 4: Run the evaluator tests**

```bash
npx vitest run src/lib/workspace-policy/__tests__/evaluation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-policy/evaluation.ts src/lib/workspace-policy/__tests__/evaluation.test.ts
git commit -m "feat: add workspace policy evaluator"
```

---

## Task 5: Add the owner-gated service layer for policy versions and exceptions

**Files:**
- Create: `src/lib/workspace-policy/service.ts`
- Create: `src/lib/workspace-policy/__tests__/service.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `src/lib/workspace-policy/__tests__/service.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { PolicyPermissionError } from '../errors.ts'
import {
  approveSingleActionException,
  consumeSingleActionException,
  createPolicyVersion,
  findMatchingSingleActionException,
  getActivePolicyVersion,
} from '../service.ts'
import { createActionFingerprint } from '../evaluation.ts'
import { createDefaultWorkspacePolicy } from '../validation.ts'
import type {
  PolicyException,
  PolicyVersion,
  WorkspacePolicyRepository,
  WorkspaceRole,
} from '../types.ts'

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
      return versions
        .filter((version) => version.workspaceId === workspaceId)
        .sort((left, right) => right.version - left.version)[0] ?? null
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
      const exception: PolicyException = {
        policyExceptionId: `exc_${exceptions.length + 1}`,
        approvedAt: new Date(`2026-04-16T21:0${exceptions.length}:00.000Z`),
        consumedAt: null,
        ...input,
      }
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
      const exception = exceptions.find((item) => item.policyExceptionId === policyExceptionId)
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
```

- [ ] **Step 2: Run the service tests to confirm they fail**

```bash
npx vitest run src/lib/workspace-policy/__tests__/service.test.ts
```

Expected: FAIL with `Cannot find module '../service.ts'`.

- [ ] **Step 3: Write `src/lib/workspace-policy/service.ts`**

```typescript
import { PolicyPermissionError } from './errors.ts'
import { createActionFingerprint } from './evaluation.ts'
import type {
  PolicyAction,
  PolicyException,
  PolicyVersion,
  WorkspacePolicyRepository,
} from './types.ts'
import { validateWorkspacePolicyDocument } from './validation.ts'

type CreatePolicyVersionInput = {
  repository: WorkspacePolicyRepository
  workspaceId: string
  createdByUserId: string
  policy: unknown
  supersedesPolicyVersionId?: string | null
}

type ApproveSingleActionExceptionInput = {
  repository: WorkspacePolicyRepository
  workspaceId: string
  runId: string
  policyVersionId: string
  agentType: PolicyException['agentType']
  action: PolicyAction
  approvedByUserId: string
}

type FindMatchingSingleActionExceptionInput = {
  repository: WorkspacePolicyRepository
  runId: string
  action: PolicyAction
}

async function assertWorkspaceOwner(
  repository: WorkspacePolicyRepository,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const role = await repository.getWorkspaceRole(userId, workspaceId)

  if (role !== 'owner') {
    throw new PolicyPermissionError('Only workspace owners may edit policy or approve exceptions')
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
  await assertWorkspaceOwner(input.repository, input.workspaceId, input.createdByUserId)

  const validatedPolicy = validateWorkspacePolicyDocument(input.policy)
  const latestVersion = await input.repository.getLatestPolicyVersion(input.workspaceId)

  return input.repository.insertPolicyVersion({
    workspaceId: input.workspaceId,
    version: latestVersion ? latestVersion.version + 1 : 1,
    policy: validatedPolicy,
    createdByUserId: input.createdByUserId,
    supersedesPolicyVersionId: input.supersedesPolicyVersionId ?? latestVersion?.policyVersionId ?? null,
  })
}

export async function approveSingleActionException(
  input: ApproveSingleActionExceptionInput,
): Promise<PolicyException> {
  await assertWorkspaceOwner(input.repository, input.workspaceId, input.approvedByUserId)

  return input.repository.insertPolicyException({
    workspaceId: input.workspaceId,
    runId: input.runId,
    policyVersionId: input.policyVersionId,
    agentType: input.agentType,
    actionType: input.action.type,
    targetFingerprint: createActionFingerprint(input.action),
    targetJson: input.action.target,
    approvedByUserId: input.approvedByUserId,
  })
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
```

- [ ] **Step 4: Run the service tests**

```bash
npx vitest run src/lib/workspace-policy/__tests__/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-policy/service.ts src/lib/workspace-policy/__tests__/service.test.ts
git commit -m "feat: add workspace policy service layer"
```

---

## Task 6: Export the module and run full verification

**Files:**
- Create: `src/lib/workspace-policy/index.ts`

- [ ] **Step 1: Write `src/lib/workspace-policy/index.ts`**

```typescript
export * from './types.ts'
export * from './errors.ts'
export * from './validation.ts'
export * from './evaluation.ts'
export * from './service.ts'
```

- [ ] **Step 2: Run the workspace-policy test suite**

```bash
npx vitest run \
  src/lib/workspace-policy/__tests__/errors.test.ts \
  src/lib/workspace-policy/__tests__/validation.test.ts \
  src/lib/workspace-policy/__tests__/evaluation.test.ts \
  src/lib/workspace-policy/__tests__/service.test.ts
```

Expected: PASS, all workspace-policy tests green.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: PASS. Existing identity tests plus the new workspace-policy tests all pass.

- [ ] **Step 4: Run TypeScript compile verification**

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace-policy/index.ts
git commit -m "feat: export workspace policy module"
```

---

## Final verification checklist

- [ ] `db/migrations/0002_workspace_policy.sql` exists and defines both policy tables
- [ ] `src/lib/workspace-policy/` exports a pure evaluator plus a repository-backed service layer
- [ ] Default policy matches the design decisions captured in `docs/superpowers/specs/2026-04-16-f-workspace-policy-design.md`
- [ ] Policy validation rejects broadened agent overrides and malformed destination grants
- [ ] Evaluator returns `allow`, `deny`, or `pause_for_exception` exactly as designed
- [ ] Single-action exceptions are exact-match, run-scoped, and consumed after use
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` passes
