# bots.ac Specification

> See `docs/decomposition.md` for the sub-spec registry. This document remains the product charter; detailed designs live under `docs/specs/`.

## Goal

bots.ac is a chat-first operating system for practical agents.

A user should be able to describe work in plain language, attach files, approve sensitive actions, and receive completed results. The system should keep state, run long jobs, connect to real tools, and stay inspectable.

This document describes product behavior and platform requirements. It intentionally avoids vendor-specific implementation details.

## Product principles

1. **Do real work**
   Agents must take action, not just generate suggestions.
2. **Keep state on purpose**
   Long-running jobs, files, and memory must persist across sessions.
3. **Stay legible**
   Users should understand what ran, what changed, what failed, and what it cost.
4. **Escalate before risk**
   Sensitive or irreversible actions require explicit approval.
5. **Prefer simple mechanisms**
   Start with small, composable primitives. Add complexity only where it buys reliability.
6. **Keep the stack replaceable**
   The product surface stays stable even if internal providers change.

## Primary use cases

- Personal and team task automation
- Research and web intelligence
- Code execution and artifact generation
- Inbox and calendar workflows
- Recurring reports and scheduled jobs
- Cross-tool orchestration across docs, tickets, repos, and messaging

## Non-goals

- A marketplace defined by model count marketing
- Opaque credit abstractions
- Hidden background actions without logs or approvals
- A mobile-native-first product before core orchestration is solid (mobile web is in scope as a delivery surface; only a dedicated native iOS/Android app is deprioritized)

## Foundations (stubs — each requires its own design doc)

The following foundational concerns are required before or during Phase 1 implementation. This spec flags them; each will be expanded in its own design document.

### Identity and authentication

- workspace ownership, team membership, role model (owner / admin / member / viewer)
- `username@bots.ac` global namespace — claim flow, collision handling, reserved prefixes
- sign-in providers and session model

### Multi-tenant isolation

- per-workspace VM is the primary isolation boundary
- cross-workspace data flows (shared artifacts, team channels, cross-team webhooks) must be explicit and auditable
- secrets never cross workspace boundaries

### Billing and cost surface

- cost units: model tokens (× published provider price), VM vCPU-hours, storage GB-months, egress bandwidth GB, tool-call counts
- user-visible cost breakdown per run, per agent, per workspace
- budget ceilings (soft warn, hard stop) at workspace and per-run levels
- BYO-key usage billed only for infra, not model spend

### Data retention and deletion

- default retention per class (artifacts, execution logs, memory, browser state, cache)
- user-initiated deletion honors cache/backup propagation within a defined window
- export (workspace bundle) must be complete enough to reconstitute state

### Workspace policy

- per-workspace configuration document that governs: browser state persistence, destructive file-change rules, approval defaults, egress allow-lists, integration scopes
- referenced from Persistent compute (browser state), Safety (destructive changes), and Integrations (scopes)

### Public API

- external programmatic interface for workspace actions (run agent, fetch artifact, list history)
- distinct from inbound webhooks and integration triggers
- authenticated per user or per workspace service account

### Compliance posture

- target stance for SOC 2, GDPR, HIPAA — to be decided
- data residency and audit log retention implications flow from this

## Core user experience

### Workspace model

bots.ac provides a persistent workspace for each user or team context.

A workspace includes:

- chat threads
- channels
- files
- agent definitions
- schedules
- webhook endpoints
- long-term memory
- execution history

### Interaction model

A typical flow is:

1. user describes a goal
2. router selects the right built-in agent or workflow
3. system asks for missing approvals only when necessary
4. agents run tools or compute
5. artifacts are stored in the workspace
6. results are returned to chat, email, or external destinations

## Built-in agents

bots.ac ships with a fixed set of first-party agents.

### Router Agent

The Router Agent runs **within** the Router and Workflow Layer shown in the architecture diagram — it is the agent-shaped component of that layer, not the layer itself. Other non-agent components (validators, approval gateway, artifact merger) execute around it.

Responsibilities:

- classify tasks
- choose agents
- load skills
- request approvals
- checkpoint risky operations
- merge outputs

The router is intentionally thin. It should not become a giant prompt that owns all memory and all integrations.

### Code Agent

Responsibilities:

- run Python, Bash, and TypeScript
- install packages inside the assigned workspace compute
- manipulate files
- generate reports, charts, and code artifacts
- host local development servers when needed

### Web Agent

Responsibilities:

- search the web
- inspect and navigate pages
- extract structured data
- summarize and compare sources
- support long-horizon browsing tasks

Default browsing strategy layer:

- **SelfEvolvingAgent** (working name; informed by `docs/self-learning-agents/` — see `docs/SELF_LEARNING_AGENTS.md` for the paper-by-paper assessment)

The Web Agent requires a strategy layer for multi-step browsing, reflection on intermediate results, and adaptation mid-task. Candidate techniques drawn from that research (notably SAGE, Reflexion, Self-Refine, EvoTest) inform the capability criteria: any chosen strategy must support step planning, intermediate reflection, failure recovery, and bounded self-adaptation within a single run (no cross-run mutation without approval). This constraint keeps the choice replaceable per product principle #6.

### Media Agent

Responsibilities:

- image generation
- image analysis
- speech-to-text
- text-to-speech
- document/media transforms

### Inbox Agent

Responsibilities:

- send email
- receive email
- triage inboxes
- draft replies
- summarize threads
- trigger workflows from mail

Addressing model:

- `username@bots.ac`

Each user gets a routable bots.ac mailbox identity for agent-driven email workflows.

### Agent Creator

Status:

- **deferred behind research gate**

bots.ac will not ship automatic agent generation until the self-learning agent review is complete and we choose a narrow, testable design.

## Persistent compute

bots.ac assigns persistent compute to each workspace.

The workspace computer is always available for:

- long-running jobs
- file persistence
- browser sessions
- package installation
- scheduled execution
- local service hosting

### VM tiers

| Tier | vCPU | RAM | Storage |
|---|---:|---:|---:|
| Small | 2 | 8 GB | 20 GB |
| Medium | 4 | 16 GB | 50 GB |
| Large | 8 | 32 GB | 100 GB |
| X-Large | 16 | 64 GB | 200 GB |

Requirements:

- tier is selected by the workspace owner at creation; team admins may change tier afterward
- VM is persistent by default (state preserved across restarts); idle-pause behavior may be enabled per workspace with a cold-start cost on resume
- tier upgrades must preserve workspace state
- tier downgrades require explicit user confirmation and are rejected when current usage exceeds the target tier's storage ceiling
- file paths must remain stable across restarts
- jobs must survive reconnects when safe to resume
- browser state may persist per workspace where the workspace policy (see Foundations) allows

## Scheduling and triggers

bots.ac supports both human-friendly scheduling and exact scheduling.

### Natural-language scheduling

Examples:

- every 3 hours
- every weekday at 8am
- first business day of the month
- every 15 minutes

Requirements:

- minimum interval: 15 minutes (inclusive — "every 15 minutes" is allowed)
- timezone-aware scheduling
- deterministic conversion to cron or equivalent internal format
- preview before save

### Trigger types

- schedule trigger
- webhook trigger
- inbox/email trigger
- external event trigger
- manual rerun trigger

### Webhooks

Requirements:

- per-workspace endpoint generation at `https://webhooks.bots.ac/<workspace-id>/<endpoint-id>`
- signed requests using HMAC-SHA256 over the raw body, delivered in the `X-BotsAc-Signature` header
- secret rotation without downtime (two active secrets allowed during rotation)
- replay protection via `X-BotsAc-Timestamp` header with configurable tolerance (default 5 minutes)
- event logs

## Integrations

bots.ac needs a large integration surface, but the product must not be coupled to one integration provider.

### Integration requirements

- managed OAuth
- secure token storage
- token refresh
- tool discovery
- action and trigger execution
- per-user account scoping
- per-workspace account scoping
- MCP compatibility where useful
- provider abstraction at the runtime boundary

### Initial integration categories

- email
- messaging
- calendar
- docs
- spreadsheets
- file storage
- repos
- tickets
- CRM
- commerce
- payments
- analytics
- support tools

### Product rule

Users interact with tools by capability and app name. Internal provider choice stays replaceable.

## Skills

Skills are the portable behavior layer.

A skill defines:

- intent
- required capabilities
- procedure
- output contract

Suggested shape:

```text
skills/
  <skill-name>/
    skill.yaml
    SKILL.md
    prompts.md
    inputs.schema.json
    outputs.schema.json
    hooks/
```

Contract rules:

- `skill.yaml` (manifest) and `SKILL.md` are **required**; other files are convention
- `hooks/` may contain agent-agnostic hook definitions invoked by the skill loader; hooks receive only the documented skill I/O contract, never agent-internal state

### Skill design rules

- agent-agnostic
- tool-capability based
- reusable across built-in agents
- inspectable as text
- versionable in git

## Memory

bots.ac uses layered memory.

### Memory scopes

- session
- channel
- workspace
- agent
- user profile

### Memory types

- short-term context
- long-term preferences
- task history
- tool outcomes
- summarized knowledge

### Memory rules

- memory must be queryable and inspectable
- memory writes must be explicit by default; implicit writes are restricted to system-managed metadata (run timestamps, tool-call counts, summarization of prior turns) and must be labeled as such in inspection views
- stale memory should be decayed or archived, not silently mixed with fresh facts
- agent memory must not grow without bounds

Suggested structure:

```text
memory/
  workspace/
    MEMORY.md
    preferences.md
    projects.md
  agents/
    code-agent.md
    web-agent.md
    inbox-agent.md
```

## Caching

Cache is not memory.

Use cache for:

- tool responses
- parsed documents
- page snapshots
- search results
- embeddings
- browser session data
- package metadata

Requirements:

- TTL per cache class
- explicit invalidation path
- separate storage from long-term memory

## Model layer

bots.ac is multi-model by design.

Requirements:

- BYO keys supported
- provider routing supported
- per-agent model selection supported
- budget controls supported
- fallback models supported, triggered by provider error, timeout, rate-limit, or per-run budget ceiling
- model choice logged per run

The product surface should talk about capability, cost, and latency—not raw model count.

## Safety and approvals

### Approval boundaries

Explicit approval required for:

- sending email
- posting messages externally
- destructive file changes outside workspace policy
- purchases or financial actions
- credentialed account changes
- irreversible external actions

### Safety controls

- dry-run mode where relevant
- execution logs
- diff previews
- checkpoint/rollback for mutable state
- secret isolation
- least-privilege tool grants

## Observability

bots.ac must be debuggable.

Track:

- run timeline
- agent chosen
- tools invoked
- artifacts created
- retries
- failures
- model spend
- latency
- approval events

### Required operator views

- run detail
- workflow graph
- task history
- schedule history
- webhook history
- cost by workspace
- cost by agent

## Delivery surfaces

### Primary surfaces

- web app
- mobile web
- email
- external destinations via integrations

### Output types

- chat response
- file artifact
- spreadsheet update
- code patch
- email
- webhook response
- scheduled report

## Architecture overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                           bots.ac Interface                             │
│      chat • channels • files • approvals • schedules • artifacts        │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Router and Workflow Layer                         │
│      classify • delegate • load skills • checkpoint • merge outputs     │
└──────────────────────┬──────────────────────────────┬────────────────────┘
                       │                              │
                       ▼                              ▼
┌──────────────────────────────┐        ┌─────────────────────────────────┐
│         Skills Layer         │        │       Built-in Agent Layer      │
│    portable behavior packs   │        │ code • web • media • inbox      │
└──────────────────────┬───────┘        └─────────────────┬───────────────┘
                       │                                  │
                       ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Execution and Persistent Compute                     │
│ sandbox runners • browsers • scheduler • jobs • persistent workspace VM │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Integrations, Memory, and Model Layer                │
│ OAuth tools • MCP tools • memory • cache • model routing • audit logs   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Automation flow

```text
┌──────────────────────┐
│ user or external event│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ schedule / trigger    │
│ parser and validator  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ router selects path   │
│ agent + skill + tools │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ run on persistent VM  │
│ or sandbox worker     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ artifacts + logs +    │
│ destination delivery  │
└──────────────────────┘
```

## Rollout plan

### Phase 1

- workspace shell
- persistent compute
- code agent
- web agent
- inbox agent
- natural-language scheduling
- audit log

### Phase 2

- media agent
- broader integration catalog
- richer memory controls
- cost dashboards
- webhook triggers

### Phase 3

- research-gated agent creator
- automatic agent adaptation
- deeper workflow evolution

## Open question

Automatic agent creation remains intentionally deferred.

### Self-learning agent review

A dedicated research track that must produce a written decision document before any Agent Creator work begins. The research material is collected in `docs/self-learning-agents/` (19 papers) with a curated summary in `docs/SELF_LEARNING_AGENTS.md`. The review must define:

- acceptable adaptation loop
- memory mutation rules
- approval boundaries
- evaluation criteria
- rollback strategy

Owner, timeline, and deliverable format are TBD. Until the review concludes, bots.ac ships fixed built-in agents plus user-defined skills.
