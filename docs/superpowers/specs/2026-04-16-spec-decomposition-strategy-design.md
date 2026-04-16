# Spec Decomposition Strategy

**Date:** 2026-04-16
**Scope:** How SPEC.md is split into executable sub-specs
**Status:** drafted

## Context

SPEC.md is a product charter for bots.ac — a chat-first agent OS. A verification pass found that the spec is internally sound but too broad for a single implementation plan: it spans ~15 independent subsystems plus 7 foundational concerns that cut across all of them.

Four of the five verification findings (placeholders, ambiguities, foundation stubs, consistency) were fixed inline in SPEC.md. This document addresses the fifth: **scope decomposition**. It defines how the charter is split, what each sub-spec looks like, how dependencies are tracked, and how the work flows from a stub into shippable code.

The strategy uses the "ships together, plans together" rule: a sub-spec is a slice that can be implemented and deployed as one coherent unit with a single implementation plan. Cross-cutting concerns each become their own sub-spec. The first shippable target (the MVP) is **Chat + Code Agent on a persistent VM** — the smallest end-to-end user loop.

## Goals

- Convert SPEC.md into an executable set of sub-specs without rewriting the charter.
- Make the dependency graph and the MVP cut line visible in one place.
- Give every sub-spec the same shape so reviewers and implementers can navigate them by memory.
- Keep status honest: a sub-spec's declared state must match the registry.

## Non-goals

- Rewriting SPEC.md. The charter stays as-is.
- Inventing process for sub-specs that haven't been brainstormed yet. Each sub-spec owns its own design decisions.
- Tooling. This is a documentation convention, not a generator or validator.

## File layout

```
/
├── SPEC.md                              (unchanged — product charter)
├── docs/
│   ├── decomposition.md                 (registry / index)
│   └── specs/
│       ├── 00-workspace-shell.md        (Phase 1 MVP core)
│       ├── 01-persistent-compute.md
│       ├── 02-code-agent.md
│       ├── 03-audit-log.md
│       ├── 10-router-agent.md
│       ├── 11-skills-loader.md
│       ├── 12-web-agent.md
│       ├── 13-inbox-agent.md
│       ├── 14-media-agent.md
│       ├── 20-natural-language-scheduler.md
│       ├── 21-trigger-engine.md
│       ├── 22-integration-framework.md
│       ├── 23-memory-system.md
│       ├── 24-cache-layer.md
│       ├── 25-model-routing.md
│       ├── 26-approvals-and-safety.md
│       ├── 27-observability.md
│       ├── 28-delivery-surfaces.md
│       ├── f-identity-and-auth.md
│       ├── f-multi-tenant-isolation.md
│       ├── f-billing-and-cost.md
│       ├── f-data-retention.md
│       ├── f-workspace-policy.md
│       ├── f-public-api.md
│       └── f-compliance-posture.md
```

**Prefix meaning** (priority signal only; dependencies still declared explicitly per file):

- `0x` — Phase 1 MVP core.
- `1x` — remaining Phase 1/2 agents.
- `2x` — cross-cutting subsystems.
- `f-*` — foundations.

No enforced ordering inside a tier. The directory is flat and greppable.

## Registry format — `docs/decomposition.md`

A single table plus a literal MVP cut line. Columns are deliberately minimal.

```markdown
# bots.ac — Spec Decomposition

SPEC.md is the product charter. Each row below is a "ships together, plans together"
slice with its own design doc under docs/specs/.

| ID  | Sub-spec                   | Status   | Depends on        | Phase |
|-----|----------------------------|----------|-------------------|-------|
| 00  | workspace-shell            | stub     | f-identity-and-auth | 1     |
| 01  | persistent-compute         | stub     | 00                | 1     |
| 02  | code-agent                 | stub     | 01, 11            | 1     |
| 03  | audit-log                  | stub     | 00                | 1     |
| --- | --------- MVP cut --------- | ---      | ---               | ---   |
| 10  | router-agent               | stub     | 11, 23            | 1     |
| 11  | skills-loader              | stub     | 00                | 1     |
| ... |                            |          |                   |       |
| f-* | (foundations)              | stub     | —                 | 0     |
```

**Status values:** `stub` → `drafted` → `approved` → `in-flight` → `shipped`.

**MVP cut line:** a literal row in the table. Everything above it is required to ship the first release. Moving the line is a registry edit and a commit message.

**Depends on:** uses sub-spec IDs, not names. Keeps rows short; enables DAG generation later without rework.

## Sub-spec template

Every file under `docs/specs/` follows this shape. Sections that don't apply get a one-line `N/A because…` rather than being deleted, so the absence is deliberate.

```markdown
# <id> — <Sub-spec name>

**Status:** stub | drafted | approved | in-flight | shipped
**Phase:** 1 | 2 | 3 | foundation
**Depends on:** <id list>
**Required for MVP:** yes | no

## Context
Why this sub-spec exists. One paragraph. Link the SPEC.md chapter(s) it derives from.

## Scope
What is in. What is explicitly out. 3–6 bullets each.

## Interfaces
The contract this sub-spec exposes to others. Function signatures, HTTP endpoints,
message schemas, file formats — whatever the boundary actually is.

## Data model
Entities owned by this sub-spec, with key fields. Not a full schema — the shape a
reader needs to reason about this spec's behavior.

## Behavior
How it works. Key flows as numbered steps or short sequence descriptions.
Error handling, retries, timeouts, idempotency guarantees.

## Open questions
Explicit list of unresolved decisions. Block `approved` status.

## Verification
How we know it works end-to-end. Tests, manual checks, MCP calls, observability signals.

## Out of scope (deferred)
Things that could belong here but are pushed to another sub-spec or later phase.
```

**Discipline points:**

- **Interfaces is load-bearing.** It's the contract consumers depend on. Changes here have blast radius; changes inside Behavior don't.
- **Depends on matches the registry.** If the template and registry disagree, the registry wins and the template is updated in the same PR.
- **Open questions block `approved`.** A `drafted` sub-spec can have open questions; an `approved` one cannot.

## Dependency model

- Dependencies point **downward** only. If `02-code-agent` depends on `01-persistent-compute`, code-agent imports what it needs; persistent-compute knows nothing about code-agent.
- **Cycles are forbidden.** If two sub-specs genuinely co-depend, they are one sub-spec — merge them.
- **Foundation sub-specs** (`f-*`) do not depend on numbered sub-specs and appear on the depends-on line of many others. They are the base of the graph. A foundation spec may depend on another foundation spec (e.g., `f-public-api` depends on `f-identity-and-auth`); such inter-foundation edges are allowed.
- A sub-spec may only be marked `approved` when every entry in its `depends-on` list is at least `approved`. Drafting is unrestricted; locking order is.

## Versioning

A `shipped` sub-spec that needs meaningful change is **versioned, not rewritten in place.**

- The existing file stays as the `v1` record of what shipped.
- The new version lives as `<id>-<name>-v2.md` (e.g. `02-code-agent-v2.md`) with its own status progression.
- The registry gets a new row for `v2`; the `v1` row stays as `shipped` for history.
- Dependents declare which version they depend on (default: latest `approved`).

"Meaningful change" = interface change, data-model change, or behavior change that breaks a consumer. Fixes and clarifications edit in place on the current version.

## Workflow scope

This strategy is written for a **solo workflow** — the author is also the reviewer and the implementer. Approval is self-approval via the merge act. Team workflow (distinct author/reviewer roles, formal approval, per-sub-spec owners) is deferred and may never be needed.

## MVP cut — Chat + Code Agent + persistent VM

Required to ship (above the registry cut line):

| ID | Sub-spec | Why it's MVP |
|----|----------|--------------|
| f-identity-and-auth | Identity & auth | Anyone using chat needs an account |
| f-workspace-policy | Workspace policy | Code Agent needs policy for destructive file changes |
| f-billing-and-cost (thin) | Billing | Need a cost-unit model to log against; dashboards come later |
| 00 | workspace-shell | Chat UI, threads, file attachments |
| 01 | persistent-compute | The VM the Code Agent runs on |
| 02 | code-agent | The single agent MVP ships |
| 03 | audit-log | Required by product principle #3 (stay legible) |

Explicitly **not** MVP: router (trivial dispatch to code-agent suffices), skills-loader (code-agent can hardcode its skills initially), web/inbox/media agents, scheduler, triggers, integrations framework, memory system, model routing, approvals beyond workspace-policy basics, broader observability, public API, full billing dashboards, multi-tenant isolation beyond per-workspace VM.

**Cut line movement:** each move is a one-line PR to `decomposition.md` with a commit message explaining the tradeoff. That's the decision log — no separate log needed.

## Adoption workflow

**Step 1 — Scaffolding (one PR)**
- Create `docs/decomposition.md` with the registry and cut line populated from SPEC.md.
- Create `docs/specs/` with one stub file per sub-spec: only the header block and a one-paragraph Context. Stubs take minutes each.
- Add one line at the top of SPEC.md: `See docs/decomposition.md for the sub-spec registry.`
- Land the scaffolding as a single atomic PR.

**Step 2 — Stubs → drafts (dependency order)**
- Start at the bottom of the graph: foundations first (`f-identity-and-auth`, `f-workspace-policy`, `f-billing-and-cost`).
- For each, run `/superpowers:brainstorming`. The brainstorming output fills in the template sections. Status moves `stub` → `drafted`.
- Work up the graph. MVP sub-specs (`00`–`03`) come after their foundations.

**Step 3 — Approve and implement**
- A `drafted` sub-spec with no open questions and all dependencies at `approved` can be reviewed for approval.
- `approved` means `/superpowers:writing-plans` may consume it.
- Implementation flips status to `in-flight`, then `shipped` when the implementing PR merges.

**Step 4 — Ongoing hygiene**
- `decomposition.md` is the single source of truth for status. Sub-spec headers must match; drift blocks review.
- New scope enters through the same pipeline: registry row → stub → brainstorm.
- SPEC.md changes are rare — only when product direction shifts. Normal work lives in sub-specs.

## Verification

The strategy is working when:

1. `docs/decomposition.md` exists and lists every sub-spec that has a file, and every sub-spec file is listed.
2. Every sub-spec header matches the registry on status, phase, depends-on, and MVP flag.
3. No sub-spec is `approved` with an unresolved open question or an unapproved dependency.
4. The MVP cut line is a single visible row in the registry.
5. Running `/superpowers:writing-plans` on any `approved` sub-spec produces an implementation plan without requiring the planner to re-read SPEC.md.

Signals (1)–(4) are mechanical and can be spot-checked during PR review. Signal (5) is the functional test — if the planner keeps bouncing back to SPEC.md, the sub-spec is under-specified or the boundary is wrong.

## Out of scope (deferred)

- **Further decomposition of foundation sub-specs.** `f-billing-and-cost` and `f-multi-tenant-isolation` may themselves need splitting once their stubs are drafted. Revisit then.
- **Team workflow semantics.** See Workflow scope above.
- Automated DAG rendering from the registry.
- A linter that checks header/registry consistency.
- Templated stub-file generation.
- Formal ADR process — commit messages on `decomposition.md` edits are the decision log.
