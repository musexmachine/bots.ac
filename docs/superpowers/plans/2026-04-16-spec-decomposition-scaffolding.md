# Spec Decomposition Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the documentation scaffolding that splits SPEC.md into an executable set of sub-specs: a registry (`docs/decomposition.md`), 25 stub files under `docs/specs/`, and a pointer line at the top of SPEC.md.

**Architecture:** A flat `docs/specs/` directory of stub files each following a shared template; a single `docs/decomposition.md` table indexing all stubs with status, dependencies, and a literal MVP cut line; SPEC.md unchanged except for one pointer line. All status values start at `stub` — brainstorming and approval happen in follow-up work, not this plan.

**Tech Stack:** Markdown only. No code, no build steps, no runtime dependencies.

**Design doc:** `docs/superpowers/specs/2026-04-16-spec-decomposition-strategy-design.md`

---

## Prerequisite

Execute this plan from the repo root (the directory containing `SPEC.md`). All paths below are repo-root-relative (e.g. `docs/decomposition.md`). If you are working in a git worktree, verify you are on the correct branch before starting:

```bash
git branch --show-current
```

---

## Task 1: Create the directory scaffolding and commit empty

**Files:**
- Create: `docs/decomposition.md` (placeholder, content in Task 2)
- Create: `docs/specs/.gitkeep`

- [ ] **Step 1: Create the directories and placeholders**

```bash
mkdir -p docs/specs
touch docs/specs/.gitkeep
touch docs/decomposition.md
```

- [ ] **Step 2: Verify the directory exists and is empty of content**

```bash
ls -la docs/ docs/specs/
```

Expected: `docs/` contains `decomposition.md` (0 bytes) and `specs/`; `docs/specs/` contains `.gitkeep` only.

- [ ] **Step 3: Commit the scaffolding**

```bash
git add docs/decomposition.md docs/specs/.gitkeep
git commit -m "docs: scaffold sub-spec directory"
```

---

## Task 2: Write `docs/decomposition.md` registry

**Files:**
- Modify: `docs/decomposition.md`

- [ ] **Step 1: Write the full registry**

Write exactly this content to `docs/decomposition.md`:

````markdown
# bots.ac — Spec Decomposition

`SPEC.md` is the product charter. Each row below is a "ships together, plans together" slice with its own design doc under `docs/specs/`. See `docs/superpowers/specs/2026-04-16-spec-decomposition-strategy-design.md` for the rules governing this file.

Research material informing sub-spec design (notably the Web Agent browsing strategy and the deferred Agent Creator) lives in `docs/self-learning-agents/` with a curated summary in `docs/SELF_LEARNING_AGENTS.md`.

## Registry

| ID  | Sub-spec                    | Status | Depends on             | Phase      | MVP |
|-----|-----------------------------|--------|------------------------|------------|-----|
| f-identity-and-auth             | Identity and authentication       | stub   | —                      | foundation | yes |
| f-workspace-policy              | Workspace policy                  | stub   | —                      | foundation | yes |
| f-billing-and-cost              | Billing and cost surface          | stub   | —                      | foundation | yes |
| 00  | workspace-shell             | stub   | f-identity-and-auth    | 1          | yes |
| 01  | persistent-compute          | stub   | 00, f-workspace-policy | 1          | yes |
| 02  | code-agent                  | stub   | 01                     | 1          | yes |
| 03  | audit-log                   | stub   | 00                     | 1          | yes |
| --- | --------- MVP cut --------- | ---    | ---                    | ---        | --- |
| f-multi-tenant-isolation        | Multi-tenant isolation            | stub   | —                      | foundation | no  |
| f-data-retention                | Data retention and deletion       | stub   | —                      | foundation | no  |
| f-public-api                    | Public API                        | stub   | f-identity-and-auth    | foundation | no  |
| f-compliance-posture            | Compliance posture                | stub   | —                      | foundation | no  |
| 10  | router-agent                | stub   | 11, 23                 | 1          | no  |
| 11  | skills-loader               | stub   | 00                     | 1          | no  |
| 12  | web-agent                   | stub   | 11, 01                 | 1          | no  |
| 13  | inbox-agent                 | stub   | 11, 22, f-identity-and-auth | 1     | no  |
| 14  | media-agent                 | stub   | 11, 01                 | 2          | no  |
| 20  | natural-language-scheduler  | stub   | 21                     | 1          | no  |
| 21  | trigger-engine              | stub   | 00                     | 1          | no  |
| 22  | integration-framework       | stub   | f-identity-and-auth    | 1          | no  |
| 23  | memory-system               | stub   | 00                     | 1          | no  |
| 24  | cache-layer                 | stub   | 00                     | 2          | no  |
| 25  | model-routing               | stub   | f-billing-and-cost     | 1          | no  |
| 26  | approvals-and-safety        | stub   | 03, f-workspace-policy | 1          | no  |
| 27  | observability               | stub   | 03, f-billing-and-cost | 2          | no  |
| 28  | delivery-surfaces           | stub   | 00                     | 1          | no  |

## Status lifecycle

`stub` → `drafted` → `approved` → `in-flight` → `shipped`

## MVP cut line

Everything above the "MVP cut" row must ship for the first release (Chat + Code Agent on a persistent VM). Moving the cut line is a registry edit with a commit-message rationale.
````

- [ ] **Step 2: Verify markdown renders and table is well-formed**

```bash
grep -c "^| " docs/decomposition.md
```

Expected: at least 29 matches (header + separator + ~25 rows + MVP-cut row).

- [ ] **Step 3: Commit**

```bash
git add docs/decomposition.md
git commit -m "docs: populate sub-spec registry"
```

---

## Task 3: Create foundation stubs (7 files)

**Files:**
- Create: `docs/specs/f-identity-and-auth.md`
- Create: `docs/specs/f-workspace-policy.md`
- Create: `docs/specs/f-billing-and-cost.md`
- Create: `docs/specs/f-multi-tenant-isolation.md`
- Create: `docs/specs/f-data-retention.md`
- Create: `docs/specs/f-public-api.md`
- Create: `docs/specs/f-compliance-posture.md`

- [ ] **Step 1: Write `docs/specs/f-identity-and-auth.md`**

````markdown
# f-identity-and-auth — Identity and authentication

**Status:** stub
**Phase:** foundation
**Depends on:** —
**Required for MVP:** yes

## Context

Every bots.ac user needs an account, and workspaces need owners. This sub-spec defines sign-in, session model, team membership, role permissions, and the `username@bots.ac` global namespace. Derived from SPEC.md → Foundations → "Identity and authentication" and SPEC.md → Inbox Agent (addressing model). Required by most Phase 1 sub-specs.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 2: Write `docs/specs/f-workspace-policy.md`**

````markdown
# f-workspace-policy — Workspace policy

**Status:** stub
**Phase:** foundation
**Depends on:** —
**Required for MVP:** yes

## Context

The per-workspace configuration document that governs browser state persistence, destructive file-change rules, approval defaults, egress allow-lists, and integration scopes. Referenced from SPEC.md → Persistent compute, Safety and approvals, and Integrations. Required before Code Agent can safely act on workspace files.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 3: Write `docs/specs/f-billing-and-cost.md`**

````markdown
# f-billing — Billing and cost surface

**Status:** stub
**Phase:** foundation
**Depends on:** —
**Required for MVP:** yes

## Context

Defines cost units (model tokens × published provider price, VM vCPU-hours, storage GB-months, egress bandwidth GB, tool-call counts), user-visible cost breakdown per run/agent/workspace, budget ceilings (soft-warn, hard-stop), and BYO-key accounting. MVP needs the unit model and the log schema; dashboards come later. Derived from SPEC.md → Foundations → "Billing and cost surface" and SPEC.md → Observability.

## Scope

_To be drafted — MVP cut only covers the unit model + cost-event schema, not dashboards or invoicing._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted — note: this stub may split during drafting (see decomposition-strategy out-of-scope)._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 4: Write `docs/specs/f-multi-tenant-isolation.md`**

````markdown
# f-multi-tenant — Multi-tenant isolation

**Status:** stub
**Phase:** foundation
**Depends on:** —
**Required for MVP:** no

## Context

Per-workspace VM is the primary isolation boundary. This sub-spec defines cross-workspace data flows (shared artifacts, team channels, cross-team webhooks), secret-containment guarantees, and the rules governing when one workspace may observe or act on another's state. Derived from SPEC.md → Foundations → "Multi-tenant isolation".

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted — this stub may split during drafting._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 5: Write `docs/specs/f-data-retention.md`**

````markdown
# f-data-retention — Data retention and deletion

**Status:** stub
**Phase:** foundation
**Depends on:** —
**Required for MVP:** no

## Context

Default retention per class (artifacts, execution logs, memory, browser state, cache), user-initiated deletion semantics and cache/backup propagation window, and workspace export completeness. Derived from SPEC.md → Foundations → "Data retention and deletion".

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 6: Write `docs/specs/f-public-api.md`**

````markdown
# f-public-api — Public API

**Status:** stub
**Phase:** foundation
**Depends on:** f-identity
**Required for MVP:** no

## Context

External programmatic interface for workspace actions (run agent, fetch artifact, list history). Distinct from inbound webhooks and integration triggers. Authenticated per user or per workspace service account. Derived from SPEC.md → Foundations → "Public API".

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 7: Write `docs/specs/f-compliance-posture.md`**

````markdown
# f-compliance — Compliance posture

**Status:** stub
**Phase:** foundation
**Depends on:** —
**Required for MVP:** no

## Context

Target stance for SOC 2, GDPR, HIPAA; data residency; audit-log retention implications. Derived from SPEC.md → Foundations → "Compliance posture".

## Scope

_To be drafted._

## Interfaces

_To be drafted — N/A likely; compliance manifests as constraints on other sub-specs._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 8: Verify all 7 files exist**

```bash
ls docs/specs/f-*.md | wc -l
```

Expected: `7`

- [ ] **Step 9: Commit**

```bash
git add docs/specs/f-*.md
git commit -m "docs: stub foundation sub-specs"
```

---

## Task 4: Create MVP core stubs (4 files)

**Files:**
- Create: `docs/specs/00-workspace-shell.md`
- Create: `docs/specs/01-persistent-compute.md`
- Create: `docs/specs/02-code-agent.md`
- Create: `docs/specs/03-audit-log.md`

- [ ] **Step 1: Write `docs/specs/00-workspace-shell.md`**

````markdown
# 00 — workspace-shell

**Status:** stub
**Phase:** 1
**Depends on:** f-identity
**Required for MVP:** yes

## Context

The persistent workspace surface: chat threads, channels, file attachments, agent definitions, schedules, webhook endpoints, long-term memory index, and execution history listing. This is the shell that every other Phase 1 sub-spec renders into. Derived from SPEC.md → Core user experience → Workspace model.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 2: Write `docs/specs/01-persistent-compute.md`**

````markdown
# 01 — persistent-compute

**Status:** stub
**Phase:** 1
**Depends on:** 00, f-workspace-policy
**Required for MVP:** yes

## Context

The per-workspace VM that hosts long-running jobs, file persistence, browser sessions, package installs, and scheduled execution. Defines tiers, assignment, lifecycle (persistent vs idle-pause), tier change semantics, and file-path stability guarantees. Derived from SPEC.md → Persistent compute.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 3: Write `docs/specs/02-code-agent.md`**

````markdown
# 02 — code-agent

**Status:** stub
**Phase:** 1
**Depends on:** 01, 11
**Required for MVP:** yes

## Context

The first-party agent that runs Python, Bash, and TypeScript inside the workspace VM, installs packages, manipulates files, and generates reports/charts/code artifacts. MVP surface: the single agent users interact with. Derived from SPEC.md → Built-in agents → Code Agent.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 4: Write `docs/specs/03-audit-log.md`**

````markdown
# 03 — audit-log

**Status:** stub
**Phase:** 1
**Depends on:** 00
**Required for MVP:** yes

## Context

The always-on record of what ran, what changed, what failed, and what it cost — required by product principle #3 ("stay legible"). Captures run timeline, agent chosen, tools invoked, artifacts created, retries, failures, model spend, latency, and approval events. Derived from SPEC.md → Observability.

## Scope

_To be drafted — MVP covers the event log; operator views (workflow graph, cost dashboards) live in 27-observability._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 5: Verify**

```bash
ls docs/specs/0*.md | wc -l
```

Expected: `4`

- [ ] **Step 6: Commit**

```bash
git add docs/specs/00-*.md docs/specs/01-*.md docs/specs/02-*.md docs/specs/03-*.md
git commit -m "docs: stub MVP core sub-specs (workspace, compute, code agent, audit)"
```

---

## Task 5: Create Phase 1 agent and loader stubs (5 files)

**Files:**
- Create: `docs/specs/10-router-agent.md`
- Create: `docs/specs/11-skills-loader.md`
- Create: `docs/specs/12-web-agent.md`
- Create: `docs/specs/13-inbox-agent.md`
- Create: `docs/specs/14-media-agent.md`

- [ ] **Step 1: Write `docs/specs/10-router-agent.md`**

````markdown
# 10 — router-agent

**Status:** stub
**Phase:** 1
**Depends on:** 11, 23
**Required for MVP:** no

## Context

The thin agent that classifies tasks, selects built-in agents, loads skills, requests approvals, checkpoints risky operations, and merges outputs. Runs *within* the Router and Workflow Layer (it is the agent-shaped component of that layer, not the layer itself). Derived from SPEC.md → Built-in agents → Router Agent.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 2: Write `docs/specs/11-skills-loader.md`**

````markdown
# 11 — skills-loader

**Status:** stub
**Phase:** 1
**Depends on:** 00
**Required for MVP:** no

## Context

The portable-behavior layer. Loads `skill.yaml`, `SKILL.md`, prompts, input/output schemas, and hooks; exposes skills to any built-in agent through a uniform contract. Skills are agent-agnostic; hooks receive only the documented skill I/O, never agent-internal state. Derived from SPEC.md → Skills.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 3: Write `docs/specs/12-web-agent.md`**

````markdown
# 12 — web-agent

**Status:** stub
**Phase:** 1
**Depends on:** 11, 01
**Required for MVP:** no

## Context

Searches the web, inspects and navigates pages, extracts structured data, summarizes and compares sources, supports long-horizon browsing. Uses a browsing strategy layer (working name `SelfEvolvingAgent`) informed by `docs/self-learning-agents/` — see `docs/SELF_LEARNING_AGENTS.md` for the paper-by-paper assessment; candidate techniques include SAGE, Reflexion, Self-Refine, and EvoTest. Any chosen strategy must support step planning, intermediate reflection, failure recovery, and bounded self-adaptation within a single run. Derived from SPEC.md → Built-in agents → Web Agent.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted — including: final choice of browsing strategy layer (candidates documented in `docs/self-learning-agents/`)._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 4: Write `docs/specs/13-inbox-agent.md`**

````markdown
# 13 — inbox-agent

**Status:** stub
**Phase:** 1
**Depends on:** 11, 22, f-identity
**Required for MVP:** no

## Context

Sends, receives, triages, drafts, summarizes, and routes email; triggers workflows from mail. Each user gets a routable `username@bots.ac` mailbox. Derived from SPEC.md → Built-in agents → Inbox Agent.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 5: Write `docs/specs/14-media-agent.md`**

````markdown
# 14 — media-agent

**Status:** stub
**Phase:** 2
**Depends on:** 11, 01
**Required for MVP:** no

## Context

Image generation and analysis, speech-to-text, text-to-speech, document/media transforms. Phase 2 per the rollout plan. Derived from SPEC.md → Built-in agents → Media Agent.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 6: Verify**

```bash
ls docs/specs/1*.md | wc -l
```

Expected: `5`

- [ ] **Step 7: Commit**

```bash
git add docs/specs/10-*.md docs/specs/11-*.md docs/specs/12-*.md docs/specs/13-*.md docs/specs/14-*.md
git commit -m "docs: stub Phase 1 agent and loader sub-specs"
```

---

## Task 6: Create cross-cutting subsystem stubs (9 files)

**Files:**
- Create: `docs/specs/20-natural-language-scheduler.md`
- Create: `docs/specs/21-trigger-engine.md`
- Create: `docs/specs/22-integration-framework.md`
- Create: `docs/specs/23-memory-system.md`
- Create: `docs/specs/24-cache-layer.md`
- Create: `docs/specs/25-model-routing.md`
- Create: `docs/specs/26-approvals-and-safety.md`
- Create: `docs/specs/27-observability.md`
- Create: `docs/specs/28-delivery-surfaces.md`

- [ ] **Step 1: Write `docs/specs/20-natural-language-scheduler.md`**

````markdown
# 20 — natural-language-scheduler

**Status:** stub
**Phase:** 1
**Depends on:** 21
**Required for MVP:** no

## Context

Parses human-friendly schedule descriptions ("every 3 hours", "every weekday at 8am", "first business day of the month", "every 15 minutes") into timezone-aware cron-equivalent internal format. Minimum interval is 15 minutes (inclusive). Must preview the resolved schedule before save. Derived from SPEC.md → Scheduling and triggers → Natural-language scheduling.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 2: Write `docs/specs/21-trigger-engine.md`**

````markdown
# 21 — trigger-engine

**Status:** stub
**Phase:** 1
**Depends on:** 00
**Required for MVP:** no

## Context

The runtime that fires triggers (schedule, webhook, inbox/email, external event, manual rerun) and dispatches into the Router and Workflow Layer. Owns webhook endpoint generation, HMAC-SHA256 signing, replay protection, and event logs. Derived from SPEC.md → Scheduling and triggers → Trigger types and Webhooks.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 3: Write `docs/specs/22-integration-framework.md`**

````markdown
# 22 — integration-framework

**Status:** stub
**Phase:** 1
**Depends on:** f-identity
**Required for MVP:** no

## Context

The provider-abstraction layer: managed OAuth, secure token storage, refresh, tool discovery, action/trigger execution, per-user and per-workspace scoping, MCP compatibility. Users interact with tools by capability and app name; the internal provider choice stays replaceable. Derived from SPEC.md → Integrations.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 4: Write `docs/specs/23-memory-system.md`**

````markdown
# 23 — memory-system

**Status:** stub
**Phase:** 1
**Depends on:** 00
**Required for MVP:** no

## Context

Layered memory across session / channel / workspace / agent / user-profile scopes, with types for short-term context, long-term preferences, task history, tool outcomes, and summarized knowledge. Memory writes are explicit by default; implicit writes are restricted to labeled system-managed metadata. Stale memory decays or archives. Derived from SPEC.md → Memory.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 5: Write `docs/specs/24-cache-layer.md`**

````markdown
# 24 — cache-layer

**Status:** stub
**Phase:** 2
**Depends on:** 00
**Required for MVP:** no

## Context

Storage for tool responses, parsed documents, page snapshots, search results, embeddings, browser session data, and package metadata. Distinct from memory: TTL per class, explicit invalidation path, separate storage. Derived from SPEC.md → Caching.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 6: Write `docs/specs/25-model-routing.md`**

````markdown
# 25 — model-routing

**Status:** stub
**Phase:** 1
**Depends on:** f-billing
**Required for MVP:** no

## Context

Multi-provider model routing: BYO keys, per-agent model selection, budget controls, fallback (triggered by provider error, timeout, rate-limit, or per-run budget ceiling), and per-run model-choice logging. Product surface talks capability/cost/latency, not raw model count. Derived from SPEC.md → Model layer.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 7: Write `docs/specs/26-approvals-and-safety.md`**

````markdown
# 26 — approvals-and-safety

**Status:** stub
**Phase:** 1
**Depends on:** 03, f-workspace-policy
**Required for MVP:** no

## Context

Approval boundaries (email sending, external messaging, destructive file changes, purchases, credential changes, irreversible external actions) and safety controls (dry-run, execution logs, diff previews, checkpoint/rollback, secret isolation, least-privilege tool grants). Derived from SPEC.md → Safety and approvals.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 8: Write `docs/specs/27-observability.md`**

````markdown
# 27 — observability

**Status:** stub
**Phase:** 2
**Depends on:** 03, f-billing
**Required for MVP:** no

## Context

Operator views built on top of the audit log: run detail, workflow graph, task history, schedule history, webhook history, cost-by-workspace, cost-by-agent. Derived from SPEC.md → Observability → Required operator views.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 9: Write `docs/specs/28-delivery-surfaces.md`**

````markdown
# 28 — delivery-surfaces

**Status:** stub
**Phase:** 1
**Depends on:** 00
**Required for MVP:** no

## Context

Primary surfaces (web app, mobile web, email, external destinations) and output types (chat response, file artifact, spreadsheet update, code patch, email, webhook response, scheduled report). Derived from SPEC.md → Delivery surfaces.

## Scope

_To be drafted._

## Interfaces

_To be drafted._

## Data model

_To be drafted._

## Behavior

_To be drafted._

## Open questions

_To be drafted._

## Verification

_To be drafted._

## Out of scope (deferred)

_To be drafted._
````

- [ ] **Step 10: Verify**

```bash
ls docs/specs/2*.md | wc -l
```

Expected: `9`

- [ ] **Step 11: Commit**

```bash
git add docs/specs/2*.md
git commit -m "docs: stub cross-cutting subsystem sub-specs"
```

---

## Task 7: Add pointer line to SPEC.md

**Files:**
- Modify: `SPEC.md` (first line)

- [ ] **Step 1: Insert pointer line at the top of SPEC.md**

Open `SPEC.md`. The current first line is:

```markdown
# bots.ac Specification
```

Insert one line *immediately below* the existing H1 heading so the top of the file reads:

```markdown
# bots.ac Specification

> See `docs/decomposition.md` for the sub-spec registry. This document remains the product charter; detailed designs live under `docs/specs/`.

## Goal
```

Preserve the blank line between the H1 and the new blockquote, and the blank line between the blockquote and `## Goal`.

- [ ] **Step 2: Verify the edit**

```bash
head -5 SPEC.md
```

Expected: H1, blank line, blockquote starting with `> See \`docs/decomposition.md\``, blank line, `## Goal`.

- [ ] **Step 3: Commit**

```bash
git add SPEC.md
git commit -m "docs: point SPEC.md at sub-spec registry"
```

---

## Task 8: Consistency verification

**Files:**
- None created; this task runs a check script inline.

- [ ] **Step 1: Verify every registry ID has a file**

```bash
grep -oE '^\| *(f-[a-z-]+|[0-9]{2}) *\|' docs/decomposition.md \
  | grep -oE '(f-[a-z-]+|[0-9]{2})' \
  | sort -u > /tmp/registry-ids.txt

ls docs/specs/ \
  | grep -oE '^(f-[a-z-]+|[0-9]{2})' \
  | sort -u > /tmp/file-ids.txt

diff /tmp/registry-ids.txt /tmp/file-ids.txt
```

Expected: empty diff (every registry ID matches a file prefix and vice versa). If not, fix the registry row or rename the file and re-run.

- [ ] **Step 2: Verify every stub file has the required header fields**

```bash
for f in docs/specs/*.md; do
  for field in "Status:" "Phase:" "Depends on:" "Required for MVP:"; do
    grep -q "\*\*${field}\*\*" "$f" || echo "MISSING ${field} in $f"
  done
done
```

Expected: no output. Any "MISSING" line means a stub header is malformed — fix inline.

- [ ] **Step 3: Verify every stub is `Status: stub`**

```bash
grep -L "^\*\*Status:\*\* stub$" docs/specs/*.md
```

Expected: no output. Any listed file has a non-stub status and should be reverted to `stub` for this scaffolding pass.

- [ ] **Step 4: Verify the MVP-cut row is present in the registry**

```bash
grep -c "MVP cut" docs/decomposition.md
```

Expected: `1` (appears only in the cut-line row — the phrase should not leak elsewhere).

- [ ] **Step 5: Commit fixes if any**

If any check in steps 1–4 produced output, fix inline, re-run the failed check until it passes, then:

```bash
git add -A docs/
git commit -m "docs: fix registry/stub consistency"
```

If all checks passed on first run, skip this commit — nothing to add.

---

## Self-review

Run these checks against the written plan before handing off.

**1. Spec coverage:** Every registry row in Task 2 has a corresponding file-creation step in Tasks 3–6. Every file created in Tasks 3–6 has a matching registry row. The SPEC.md pointer line (Task 7) is the only charter mutation. ✓

**2. Placeholder scan:** The plan uses `_To be drafted._` inside stub files — this is intentional stub content (the whole point of a stub), not a plan-level placeholder. All commands, file paths, and commit messages in the plan itself are concrete. ✓

**3. Type consistency:** The four stub header fields are identical across all 25 stubs: `Status`, `Phase`, `Depends on`, `Required for MVP`. The registry columns match these: `Status`, `Phase`, `Depends on`, `MVP`. (Registry uses `MVP` column header; stubs use `Required for MVP:` field name — different audiences, same semantic. Verify step 2 of Task 8 checks the stub side; the registry column is human-read only.) ✓

**4. Prerequisite respected:** Task 7 (SPEC.md edit) is the only task that assumes SPEC.md is in the working tree. If the executor follows prerequisite Option A, all tasks land in the main repo working directory. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-spec-decomposition-scaffolding.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
