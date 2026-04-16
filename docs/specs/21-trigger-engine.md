# 21 — trigger-engine

**Status:** stub
**Phase:** 1
**Depends on:** 00
**Required for MVP:** no

## Context

The runtime that fires triggers (schedule, webhook, inbox/email, external event, manual rerun) and dispatches into the Router and Workflow Layer. Owns webhook endpoint generation at `https://webhooks.bots.ac/<workspace-id>/<endpoint-id>`, HMAC-SHA256 signing over the raw body delivered in `X-BotsAc-Signature`, replay protection via `X-BotsAc-Timestamp` with configurable tolerance (default 5 minutes), and event logs. Derived from SPEC.md → Scheduling and triggers → Trigger types and Webhooks.

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
