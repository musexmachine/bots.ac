# bots.ac — Spec Decomposition

`SPEC.md` is the product charter. Each row below is a "ships together, plans together" slice with its own design doc under `docs/specs/`. See `docs/superpowers/specs/2026-04-16-spec-decomposition-strategy-design.md` for the rules governing this file.

Research material informing sub-spec design (notably the Web Agent browsing strategy and the deferred Agent Creator) lives in `docs/self-learning-agents/` with a curated summary in `docs/SELF_LEARNING_AGENTS.md`.

## Registry

| ID  | Sub-spec                    | Status | Depends on             | Phase      | MVP |
|-----|-----------------------------|--------|------------------------|------------|-----|
| f-identity-and-auth             | Identity and authentication       | drafted | —                     | foundation | yes |
| f-workspace-policy     | Workspace policy                  | stub   | —                      | foundation | yes |
| f-billing-and-cost              | Billing and cost surface          | stub   | —                      | foundation | yes |
| f-multi-tenant-isolation         | Multi-tenant isolation            | stub   | —                      | foundation | no  |
| f-data-retention       | Data retention and deletion       | stub   | —                      | foundation | no  |
| f-public-api           | Public API                        | stub   | f-identity-and-auth             | foundation | no  |
| f-compliance-posture                | Compliance posture                | stub   | —                      | foundation | no  |
| 00  | workspace-shell             | stub   | f-identity-and-auth    | 1          | yes |
| 01  | persistent-compute          | stub   | 00, f-workspace-policy | 1          | yes |
| 02  | code-agent                  | stub   | 01                     | 1          | yes |
| 03  | audit-log                   | stub   | 00                     | 1          | yes |
| --- | --------- MVP cut --------- | ---    | ---                    | ---        | --- |
| 10  | router-agent                | stub   | 11, 23                 | 1          | no  |
| 11  | skills-loader               | stub   | 00                     | 1          | no  |
| 12  | web-agent                   | stub   | 11, 01                 | 1          | no  |
| 13  | inbox-agent                 | stub   | 11, 22, f-identity-and-auth     | 1          | no  |
| 14  | media-agent                 | stub   | 11, 01                 | 2          | no  |
| 20  | natural-language-scheduler  | stub   | 21                     | 1          | no  |
| 21  | trigger-engine              | stub   | 00                     | 1          | no  |
| 22  | integration-framework       | stub   | f-identity-and-auth             | 1          | no  |
| 23  | memory-system               | stub   | 00                     | 1          | no  |
| 24  | cache-layer                 | stub   | 00                     | 2          | no  |
| 25  | model-routing               | stub   | f-billing-and-cost              | 1          | no  |
| 26  | approvals-and-safety        | stub   | 03, f-workspace-policy | 1          | no  |
| 27  | observability               | stub   | 03, f-billing-and-cost          | 2          | no  |
| 28  | delivery-surfaces           | stub   | 00                     | 1          | no  |

## Status lifecycle

`stub` → `drafted` → `approved` → `in-flight` → `shipped`

## MVP cut line

Everything above the "MVP cut" row plus the `yes` foundation rows must ship for the first release (Chat + Code Agent on a persistent VM). Moving the cut line is a registry edit with a commit-message rationale.
