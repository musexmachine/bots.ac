# f-workspace-policy — Workspace policy

**Status:** drafted
**Phase:** foundation
**Depends on:** —
**Required for MVP:** yes

## Context

The per-workspace configuration document that governs browser state persistence, destructive file-change rules, approval defaults, egress allow-lists, and integration scopes. Referenced from SPEC.md → Persistent compute, Safety and approvals, and Integrations. Required before Code Agent can safely act on workspace files.

Full design: `docs/superpowers/specs/2026-04-16-f-workspace-policy-design.md`

## Scope

**In:**
- Canonical control-plane policy document stored outside the workspace filesystem
- Immutable workspace policy versions, with new versions applying only to new runs
- One workspace baseline plus built-in agent-type overrides
- File, browser persistence, network egress, and integration capability rules
- Destination-bounded pre-authorization for external writes
- Single-action, run-scoped exceptions approved by the workspace owner
- Owner-only policy edits and owner-only exception approvals

**Out:**
- Policy editor UI
- Agent-instance overrides
- Delegated approvers
- Team-admin policy editing
- Audit-log fanout beyond the durable policy/version records defined here

## Interfaces

```typescript
createPolicyVersion(input: CreatePolicyVersionInput): Promise<PolicyVersion>
getActivePolicyVersion(workspaceId: string): Promise<PolicyVersion | null>
evaluatePolicyAction(input: PolicyEvaluationInput): PolicyEvaluationResult
approveSingleActionException(input: ApproveSingleActionExceptionInput): Promise<PolicyException>
consumeSingleActionException(input: ConsumeSingleActionExceptionInput): Promise<void>
```

Decision outcomes: `allow`, `deny`, `pause_for_exception`.

## Data model

**`workspace_policy_versions`:** immutable policy versions keyed by `workspace_id` + incrementing `version`, storing the full policy JSON, creator, timestamp, and optional superseded version pointer.

**`workspace_policy_exceptions`:** run-scoped single-action grants storing `run_id`, `policy_version_id`, `agent_type`, `action_type`, target fingerprint/JSON, approver, approval time, and optional `consumed_at`.

**Policy document:** browser persistence default, file permissions, network restrictions, integration scope grants, destination grants, and agent-type overrides.

## Behavior

1. The workspace owner saves a new immutable policy version in the control plane.
2. Each run snapshots the active `policyVersionId` at start.
3. Every guarded action calls the central policy evaluator with `agentType`, `action`, and `target`.
4. The evaluator merges the workspace baseline with any agent-type override and returns `allow`, `deny`, or `pause_for_exception`.
5. If a blocked action is exception-eligible, the run pauses and only the workspace owner may approve one exact single-action grant.
6. Exceptions never mutate the baseline policy and expire after use or run end.

## Open questions

None that block `approved` status. See the design doc for the recorded charter change that allows destination-bounded policy pre-authorization for external side effects.

## Verification

- Invalid policy documents are rejected at write time
- Agent overrides cannot broaden file, network, or integration permissions
- Persistent browser sessions are denied unless workspace or agent policy opted in
- Localhost/private-network egress is hard-blocked
- Integration writes require both scope permission and a matching destination grant
- Single-action exceptions allow exactly one matching blocked action and are consumed after use

## Out of scope (deferred)

- Policy editor UI and self-serve admin tooling
- Agent-instance overrides and automation-instance overrides
- Delegated approvers or non-owner exception handling
- Automatic audit-log fanout once `03-audit-log` exists
