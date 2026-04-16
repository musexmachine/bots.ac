# f-identity-and-auth — Identity and Authentication Design

**Date:** 2026-04-16
**Status:** drafted
**Sub-spec:** `docs/specs/f-identity-and-auth.md`
**Phase:** foundation
**Required for MVP:** yes

---

## Context

bots.ac needs an account model before any user-facing surface can exist. This design covers sign-in, session model, the `username@bots.ac` global namespace, and the role enum that team workspaces will use when they ship. It is the first foundation spec drafted and is a hard dependency for `00-workspace-shell`, `13-inbox-agent`, `22-integration-framework`, and `f-public-api`.

Source sections in SPEC.md: Foundations → "Identity and authentication"; Built-in agents → Inbox Agent (addressing model).

---

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Sign-in providers | Google OAuth, GitHub OAuth, magic link (email OTP) |
| Team workspaces | Personal only at launch; team workspaces deferred |
| Username claim | Auto-derived from OAuth provider username; one rename allowed |
| Session model | Long-lived JWT (1-week TTL); no refresh token; no server-side revocation at launch |
| Role model | Define all four roles (`owner`/`admin`/`member`/`viewer`) now; only `owner` assigned at launch |
| Auth implementation | Supabase Auth (self-hostable, open-source) behind a thin `identity` adapter |

---

## Architecture

Supabase Auth handles all authentication: Google OAuth, GitHub OAuth, and magic link (email OTP). It issues RS256 JWTs with a configurable TTL (default 1 week). bots.ac never stores passwords or implements OAuth flows directly.

The rest of bots.ac accesses auth through a single `identity` adapter module. Nothing outside the adapter imports Supabase Auth directly. This keeps the provider replaceable per SPEC.md product principle #6.

bots.ac owns two tables (`users`, `workspace_members`) in its own database schema, independent of Supabase's `auth` schema.

```
Browser / API client
        │  JWT (Supabase-issued, RS256)
        ▼
  identity adapter
  ┌─────────────────────────────────────────┐
  │  getCurrentUser()                        │
  │  getOptionalUser()                       │
  │  requireAuth()                           │
  │  getWorkspaceMembership(workspaceId)     │
  │  listUserWorkspaces()                    │
  │  claimUsername()                         │
  │  renameUsername()                        │
  └──────────┬──────────────────────────────┘
             │                    │
     Supabase Auth            bots.ac DB
     (JWT validation,         (users table,
      OAuth, magic link)       workspace_members)
```

---

## Data model

### `users`

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK | bots.ac-internal stable identifier |
| `supabase_user_id` | `uuid` UNIQUE NOT NULL | FK to `auth.users.id` in Supabase |
| `email` | `text` UNIQUE NOT NULL | from provider; updated on sign-in |
| `username` | `citext` UNIQUE NOT NULL | case-insensitive; claimed at first sign-in |
| `username_renamed_at` | `timestamptz` NULL | NULL = rename not yet used; set on first rename |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() | |

### `workspace_members`

| Column | Type | Notes |
|---|---|---|
| `workspace_id` | `uuid` NOT NULL | FK to `workspaces.id` (owned by `00-workspace-shell`) |
| `user_id` | `uuid` NOT NULL | FK to `users.user_id` |
| `role` | `enum('owner','admin','member','viewer')` NOT NULL | only `owner` assigned at launch |
| `joined_at` | `timestamptz` NOT NULL DEFAULT now() | |
| PK | (`workspace_id`, `user_id`) | composite |

### Username namespace rules

- **Claim:** derive candidate from OAuth `login` (GitHub) or email local-part (Google / magic link). Strip non-alphanumeric except hyphens, lowercase, truncate to 30 chars.
- **Collision:** append `-2`, `-3`, … until unique.
- **Reserved prefixes (blocked at claim and rename):** `admin`, `system`, `support`, `api`, `bots`, `help`, `security`, `abuse`.
- **Rename:** allowed once. `username_renamed_at` is set on use; further renames rejected. Old username released immediately (no hold period at launch).

---

## Interfaces

The `identity` adapter exports:

```typescript
// Verify JWT and return resolved user. Throws AuthError if invalid.
getCurrentUser(req: Request): Promise<User>

// Like getCurrentUser but returns null instead of throwing.
getOptionalUser(req: Request): Promise<User | null>

// Guard — throws AuthError (401) if not authenticated.
requireAuth(req: Request): Promise<User>

// Returns membership record. Throws NotFoundError if not a member.
getWorkspaceMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership>

// Returns all workspaces the user is a member of.
listUserWorkspaces(userId: string): Promise<WorkspaceMembership[]>

// Claim username at first sign-in. Resolves collisions internally.
claimUsername(userId: string, candidate: string): Promise<string>

// Rename username. Throws if reserved, taken, or rename limit reached.
renameUsername(userId: string, newUsername: string): Promise<string>
```

```typescript
type User = {
  userId: string    // bots.ac user_id (uuid)
  email: string
  username: string
}

type WorkspaceMembership = {
  workspaceId: string
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joinedAt: Date
}
```

**Error types:** `AuthError` (401), `ForbiddenError` (403), `NotFoundError` (404), `UsernameError` (400).

---

## Behavior

### Sign-in (all providers)

1. Client initiates OAuth (Google/GitHub) or requests magic link via Supabase Auth SDK.
2. Supabase Auth handles provider round-trip and issues a signed JWT.
3. Client presents JWT on first API call. `requireAuth` validates via Supabase's JWKS endpoint.
4. Adapter checks `users` for `supabase_user_id`. If row exists → return `User`, done.
5. **First sign-in provisioning:** derive username candidate from provider. Call `claimUsername` — resolves collisions, rejects reserved prefixes, inserts `users` row. Emit `user.created` event; `00-workspace-shell` listens and creates the default workspace + `workspace_members` row with role `owner`.

### Magic link

1. User submits email. Adapter calls Supabase Auth to send OTP (TTL: 1 hour, Supabase default).
2. User clicks link or submits OTP. Supabase validates and issues JWT.
3. Continues at step 3 of sign-in flow above.

### Username rename

1. User submits new username. `renameUsername` called.
2. Reject if: reserved prefix, already taken (case-insensitive), or `username_renamed_at` is not NULL.
3. Update `users.username`, set `username_renamed_at = now()`.
4. Return new username.

### JWT validation

- RS256. Verified using Supabase project's JWKS endpoint.
- TTL: 1 week (Supabase default; adjustable via Supabase dashboard).
- No server-side revocation at launch. Compromise response: rotate Supabase JWT secret (invalidates all sessions).

### Error table

| Condition | Error |
|---|---|
| JWT missing or malformed | `AuthError` 401 |
| JWT expired | `AuthError` 401 |
| User not a member of workspace | `NotFoundError` 404 |
| Username reserved or taken | `UsernameError` 400 with reason field |
| Rename already used | `UsernameError` 400 "rename limit reached" |

---

## Open questions

None that block `approved` status.

**Recorded design choices (not open, but worth documenting):**

- *Old username hold period:* Immediate release chosen for simplicity. A 30-day hold is the common alternative for impersonation prevention. Revisit if abuse is observed post-launch.
- *JWT TTL:* 1-week default balances UX (no re-auth friction) against token exposure window. Shorten if security posture tightens.

---

## Verification

- Sign-in via Google, GitHub, and magic link each complete and produce a `users` row
- First sign-in auto-claims a username; collision → `-2` suffix appended
- Reserved prefix rejected at claim and at rename
- Rename succeeds once; second attempt returns `UsernameError` 400
- Expired / malformed JWT returns 401; valid JWT for new user triggers provisioning
- `getWorkspaceMembership` returns 404 for a non-member
- All provisioned users have `role = 'owner'` in `workspace_members`
- Adapter is the only import of Supabase Auth (grep check: no other file imports `@supabase/supabase-js` auth methods)

---

## Out of scope (deferred)

- Team workspace membership — invites, role changes, member removal — deferred with team workspaces
- Per-device session tracking and individual session revocation
- SSO / SAML enterprise login
- Account deletion and username release
- MFA / 2FA
- Username hold period after rename
- Admin-side user management UI
