# f-workspace-policy — Workspace Policy Design

**Date:** 2026-04-16
**Status:** drafted
**Sub-spec:** `docs/specs/f-workspace-policy.md`
**Phase:** foundation
**Required for MVP:** yes

---

## Context

bots.ac needs a control-plane permission system before agents can act with any meaningful autonomy. This design defines the workspace baseline policy, built-in agent overrides, versioning semantics, one-time exception flow, and the central evaluation API that every guarded subsystem must call.

It is an MVP foundation dependency for `01-persistent-compute`, `02-code-agent`, and `26-approvals-and-safety`.

Source sections in SPEC.md: Foundations → "Workspace policy"; Persistent compute; Integrations; Safety and approvals.

---

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Launch posture | Productivity-by-default |
| Canonical storage | Control-plane only |
| Policy granularity | Workspace baseline plus built-in agent-type overrides |
| Destructive file rule | Full autonomy inside workspace root; outside-root actions pause for an exception |
| Outbound network default | Broad HTTPS allowed by default; localhost, private-network targets, and sensitive non-HTTPS protocols are hard-blocked |
| Browser persistence | Off by default; workspace or agent override may opt in |
| Override model | Mixed: browser persistence may opt in per agent; file/network/integration rules may only narrow |
| External side effects | Policy may pre-authorize them, but only with destination-bounded grants |
| Policy editor | Workspace owner only |
| Integration model | Per-integration capability scopes |
| Policy versioning | Immutable versions; new versions apply only to new runs |
| Blocked-action handling | Pause for a one-time exception |
| Exception approver | Workspace owner only |
| Exception scope | Single action on one exact target; expires after use or run end |
| Override attachment | Built-in agent type, not agent instance |
| Core implementation pattern | Central policy engine with one evaluator API |

---

## Architecture

The canonical policy lives outside the workspace filesystem in the control plane. Agents can read effective policy, but they cannot rewrite it by editing files. A workspace has one active baseline policy document plus optional override blocks keyed by built-in agent type (`code-agent`, `web-agent`, `inbox-agent`, `router-agent`, `media-agent`).

Every run snapshots the current `policyVersionId` when it starts. That snapshot travels with the run and is the only version consulted for later guard checks. If the owner edits policy mid-run, the new version applies to subsequent runs only. This keeps evaluation deterministic and makes review/debugging possible later.

Enforcement is centralized. Compute, browser, integrations, and future safety layers do not invent their own permission logic. They submit a structured request to the policy engine with `workspaceId`, `policyVersionId`, `agentType`, `action`, and `target`. The evaluator returns `allow`, `deny`, or `pause_for_exception`.

```
Workspace owner edits policy
          │
          ▼
workspace_policy_versions
          │
Run start snapshots active version
          │
          ▼
   policy evaluator
  ┌───────────────────────────────┐
  │ merge workspace baseline      │
  │ + agent-type override         │
  │ classify action + target      │
  │ return allow / deny / pause   │
  └──────────────┬────────────────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
  compute     browser    integrations
```

Hard-blocks are reserved for impossible or clearly unsafe targets: localhost, private-network destinations, and sensitive non-HTTPS protocols. Actions that are merely outside the current policy envelope pause for a one-time owner exception instead of failing permanently.

This design intentionally changes the current charter semantics for approvals. External side effects do not always require per-action approval. They may be pre-authorized when the workspace policy explicitly allows the connected account, capability scope, and destination bound. That product-direction change must stay visible in `SPEC.md`, not live only in this sub-spec.

---

## Data model

### Policy document shape

The canonical policy document is typed JSON. It needs only the fields required to evaluate launch-time decisions:

```typescript
type WorkspacePolicyDocument = {
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
  integrations: Record<string, {
    allowedScopes: string[]
    destinationGrants: DestinationGrant[]
  }>
  agentOverrides: Partial<Record<BuiltInAgentType, AgentPolicyOverride>>
}
```

`agentOverrides` may narrow file, network, and integration permissions, but may only broaden browser persistence from `ephemeral` to `persistent`.

### Destination grants

External writes are authorized through destination-bounded grants:

```typescript
type DestinationGrant = {
  accountId: string
  scope: string
  targetType:
    | 'email-domain'
    | 'webhook-host'
    | 'github-org'
    | 'github-repo'
    | 'payment-counterparty'
  targetPattern: string
  spendLimitCents?: number
}
```

This keeps policy pre-authorization narrow enough to reason about. `gmail.send` alone is not enough; the matching account plus destination bound must also match.

### `workspace_policy_versions`

| Column | Type | Notes |
|---|---|---|
| `policy_version_id` | `uuid` PK | stable identifier for run snapshots |
| `workspace_id` | `uuid` NOT NULL | FK to `workspaces.id` later, once `00-workspace-shell` exists |
| `version` | `integer` NOT NULL | monotonic per workspace |
| `policy_json` | `jsonb` NOT NULL | full canonical policy document |
| `created_by_user_id` | `uuid` NOT NULL | owner who saved the version |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() | |
| `supersedes_policy_version_id` | `uuid` NULL | previous version pointer |

Uniqueness: `(workspace_id, version)`.

### `workspace_policy_exceptions`

| Column | Type | Notes |
|---|---|---|
| `policy_exception_id` | `uuid` PK | |
| `workspace_id` | `uuid` NOT NULL | |
| `run_id` | `uuid` NOT NULL | no FK yet; run model belongs to later specs |
| `policy_version_id` | `uuid` NOT NULL | FK to `workspace_policy_versions` |
| `agent_type` | `text` NOT NULL | built-in agent key |
| `action_type` | `text` NOT NULL | file/network/browser/integration action class |
| `target_fingerprint` | `text` NOT NULL | stable exact-match key for one action on one target |
| `target_json` | `jsonb` NOT NULL | original structured target |
| `approved_by_user_id` | `uuid` NOT NULL | owner who granted the exception |
| `approved_at` | `timestamptz` NOT NULL DEFAULT now() | |
| `consumed_at` | `timestamptz` NULL | null until used |

These rows are the durable source of truth for exception handling until `03-audit-log` exists.

---

## Interfaces

The policy module should export one pure evaluator plus persistence/orchestration services:

```typescript
createDefaultWorkspacePolicy(): WorkspacePolicyDocument
validateWorkspacePolicyDocument(input: unknown): WorkspacePolicyDocument
evaluatePolicyAction(input: PolicyEvaluationInput): PolicyEvaluationResult
createPolicyVersion(input: CreatePolicyVersionInput): Promise<PolicyVersion>
getActivePolicyVersion(workspaceId: string): Promise<PolicyVersion | null>
approveSingleActionException(input: ApproveSingleActionExceptionInput): Promise<PolicyException>
findMatchingSingleActionException(input: FindMatchingExceptionInput): Promise<PolicyException | null>
consumeSingleActionException(input: ConsumeSingleActionExceptionInput): Promise<void>
```

Key runtime shapes:

```typescript
type PolicyEvaluationInput = {
  policy: WorkspacePolicyDocument
  agentType: BuiltInAgentType
  action: PolicyAction
  matchingException?: PolicyException | null
}

type PolicyEvaluationResult =
  | { decision: 'allow'; reason: string }
  | { decision: 'deny'; reason: string }
  | { decision: 'pause_for_exception'; reason: string; targetFingerprint: string }
```

`PolicyAction` must be structured enough that destination-bounded evaluation is real, not hand-wavey. For example:

- file action: `path`, `operation`, `insideWorkspaceRoot`
- browser action: `persistent`
- network action: `scheme`, `host`, `ipClass`
- integration write: `provider`, `accountId`, `scope`, `destinationType`, `destination`, optional `spendCents`

Unknown action types, malformed targets, or unknown capability scopes fail closed.

---

## Behavior

### Policy save

1. Workspace owner submits a new policy document.
2. The service validates structure and override rules before any write happens.
3. Service verifies the actor is the `owner` of the workspace.
4. Service loads the latest version number, inserts a new immutable row, and records which version it superseded.
5. The newly inserted version becomes the active version for future runs.

### Run start

1. Scheduler/router/runner resolves the current active `policyVersionId` for the workspace.
2. That `policyVersionId` is attached to the run record.
3. All later guard checks use that exact version, even if the owner edits policy mid-run.

### Guarded action evaluation

1. Subsystem submits `agentType`, `action`, and structured `target`.
2. Evaluator merges workspace baseline with the matching agent override.
3. Evaluator rejects hard-blocks first:
   - localhost or private-network egress
   - sensitive non-HTTPS protocols
   - malformed destination data
4. Evaluator then applies action-specific rules:
   - file changes inside the workspace root follow `insideWorkspaceRoot`
   - file changes outside the workspace root pause for exception
   - persistent browser sessions require workspace or agent opt-in
   - integration reads require an allowed capability scope
   - integration writes require both scope permission and a matching destination grant
5. Evaluator returns `allow`, `deny`, or `pause_for_exception`.

### Single-action exception flow

1. A blocked-but-exception-eligible action pauses the run and exposes its exact `targetFingerprint`.
2. Only the workspace owner may approve that action.
3. Approval creates one `workspace_policy_exceptions` row scoped to one run + one target fingerprint.
4. Re-evaluation of the same action sees the matching unconsumed exception and returns `allow`.
5. The exception is marked `consumed_at` after use, or considered expired when the run ends.

---

## Open questions

None that block `approved` status.

**Recorded design choices worth preserving:**

- **Charter change:** external side effects may be pre-authorized when the workspace policy explicitly names the account, capability, and destination bound.
- **No run/audit tables yet:** `run_id` is stored without an FK for now; `03-audit-log` will later fan policy/version/exception events into the broader operator timeline.

---

## Verification

- Invalid policy documents are rejected at write time
- Unknown agent types and malformed overrides are rejected at write time
- Agent overrides cannot broaden file, network, or integration permissions
- Persistent browser sessions are denied unless the workspace or agent policy opted in
- Public HTTPS egress is allowed by default; localhost/private-network targets are denied
- Integration writes require a matching account + scope + destination grant
- Spend-bounded writes pause when the requested spend exceeds the grant limit
- Single-action exceptions allow exactly one matching blocked action and are consumed afterward
- Re-running the same evaluation input against the same `policyVersionId` returns the same result

---

## Out of scope (deferred)

- Policy editor UI and self-serve policy management workflows
- Agent-instance or automation-instance overrides
- Delegated approvers
- Team-admin policy edits
- Rich audit-log fanout and workflow graph integration
- Non-MVP network postures beyond the typed schema (`curated-common`, `allow-list-only`)
