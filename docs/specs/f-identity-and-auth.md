# f-identity-and-auth — Identity and authentication

**Status:** drafted
**Phase:** foundation
**Depends on:** —
**Required for MVP:** yes

## Context

Every bots.ac user needs an account, and workspaces need owners. This sub-spec defines sign-in, session model, team membership, role permissions, and the `username@bots.ac` global namespace. Derived from SPEC.md → Foundations → "Identity and authentication" and SPEC.md → Inbox Agent (addressing model). Required by most Phase 1 sub-specs.

Full design: `docs/superpowers/specs/2026-04-16-f-identity-and-auth-design.md`

## Scope

**In:**
- Sign-in via Google OAuth, GitHub OAuth, and magic link (email OTP)
- Long-lived JWT session model (Supabase Auth, RS256, 1-week TTL)
- `users` table: bots.ac user ID, Supabase user ID FK, email, username, rename tracking
- `workspace_members` table: user-to-workspace mapping with role
- `username@bots.ac` namespace: auto-claim at first sign-in, one rename allowed, reserved prefixes blocked
- `identity` adapter module: the only interface other sub-specs use for auth concerns
- Role enum (`owner`/`admin`/`member`/`viewer`) defined in schema; only `owner` assigned at launch

**Out:**
- Team workspace membership management (invites, role changes) — deferred with team workspaces
- Per-device session tracking and revocation
- SSO / SAML
- Account deletion
- MFA / 2FA
- Username hold period after rename

## Interfaces

```typescript
getCurrentUser(req: Request): Promise<User>
getOptionalUser(req: Request): Promise<User | null>
requireAuth(req: Request): Promise<User>
getWorkspaceMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership>
listUserWorkspaces(userId: string): Promise<WorkspaceMembership[]>
claimUsername(userId: string, candidate: string): Promise<string>
renameUsername(userId: string, newUsername: string): Promise<string>
```

Error types: `AuthError` (401), `ForbiddenError` (403), `NotFoundError` (404), `UsernameError` (400).

## Data model

**`users`:** `user_id` (PK), `supabase_user_id` (UNIQUE), `email` (UNIQUE), `username` (citext UNIQUE), `username_renamed_at` (nullable), `created_at`.

**`workspace_members`:** (`workspace_id`, `user_id`) composite PK, `role` enum, `joined_at`. `workspace_id` is a FK to `workspaces.id` owned by `00-workspace-shell`.

## Behavior

1. Client authenticates via Supabase Auth (OAuth round-trip or magic link OTP).
2. Supabase issues RS256 JWT (1-week TTL). Client presents it on every request.
3. `requireAuth` validates JWT via Supabase JWKS. Looks up `users` by `supabase_user_id`.
4. First sign-in: derives username from provider, calls `claimUsername` (collision resolution + reserved-prefix check), inserts `users` row, emits `user.created` event for `00-workspace-shell` to create default workspace + owner membership.
5. Rename: allowed once; `username_renamed_at` set on use; second attempt → `UsernameError` 400.

## Open questions

None. See design doc for recorded choices on username hold period and JWT TTL.

## Verification

- Sign-in via all three providers produces a `users` row
- First-sign-in username collision appends `-2` suffix
- Reserved prefix rejected at claim and rename
- Rename succeeds once; second attempt returns 400
- Expired/malformed JWT returns 401
- `getWorkspaceMembership` returns 404 for non-members
- No file outside `identity` adapter imports Supabase Auth methods (grep check)

## Out of scope (deferred)

- Team membership management — deferred with team workspaces
- Per-device session revocation, SSO/SAML, account deletion, MFA, username hold period
