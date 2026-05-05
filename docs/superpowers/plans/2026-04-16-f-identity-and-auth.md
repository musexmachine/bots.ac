# f-identity-and-auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `identity` adapter module — the single interface all of bots.ac uses for auth — backed by Supabase Auth with Google OAuth, GitHub OAuth, and magic link sign-in.

**Architecture:** Supabase Auth issues RS256 JWTs; the `identity` adapter validates them and maintains a `users` table (bots.ac user ID, Supabase FK, email, username) and a `workspace_members` table (user-to-workspace with role). No module outside `src/lib/identity/` imports Supabase Auth directly. Username namespace lives in the bots.ac DB with collision resolution and reserved-prefix blocking.

**Tech Stack:** TypeScript, Supabase JS SDK v2 (`@supabase/supabase-js`), Vitest, Node.js 20+. No ORM — Supabase's built-in query builder is sufficient for two tables.

**Design doc:** `docs/superpowers/specs/2026-04-16-f-identity-and-auth-design.md`

---

## File Structure

```
src/
  lib/
    identity/
      index.ts          — public barrel; re-exports all adapter functions
      types.ts          — User, WorkspaceMembership, UserCreatedEvent types
      errors.ts         — AuthError, ForbiddenError, NotFoundError, UsernameError
      client.ts         — Supabase client factory (auth client + admin client)
      username.ts       — claimUsername, renameUsername, sanitizeCandidate, RESERVED_PREFIXES
      adapter.ts        — getCurrentUser, getOptionalUser, requireAuth (+ internal provisioning)
      membership.ts     — getWorkspaceMembership, listUserWorkspaces
      __tests__/
        username.test.ts
        adapter.test.ts
        membership.test.ts
db/
  migrations/
    0001_identity.sql   — citext extension, users table, workspace_members table
package.json
tsconfig.json
vitest.config.ts
.env.example
```

---

## Task 1: Project foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bots-ac",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.43.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `.env.example`**

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.env
*.env.local
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Verify TypeScript compiles (no src files yet — expect empty output)**

```bash
npx tsc --noEmit 2>&1 || true
```

Expected: exits cleanly (no src files = nothing to check yet).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example .gitignore
git commit -m "feat: add project foundation (package.json, tsconfig, vitest)"
```

---

## Task 2: Database migration

**Files:**
- Create: `db/migrations/0001_identity.sql`

- [ ] **Step 1: Create the migration directory**

```bash
mkdir -p db/migrations
```

- [ ] **Step 2: Write `db/migrations/0001_identity.sql`**

```sql
-- Enable case-insensitive text type
CREATE EXTENSION IF NOT EXISTS citext;

-- bots.ac users table
-- supabase_user_id references auth.users.id in the Supabase project
-- username is nullable here; claimUsername sets it immediately after INSERT
-- and the app layer never returns a User with a null username
CREATE TABLE IF NOT EXISTS users (
  user_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id    UUID        UNIQUE NOT NULL,
  email               TEXT        UNIQUE NOT NULL,
  username            CITEXT      UNIQUE,
  username_renamed_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace membership table
-- workspace_id FK to workspaces.id is added in the 00-workspace-shell migration;
-- the column exists now so identity can write membership rows at sign-in.
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID        NOT NULL,
  user_id      UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role         TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);
```

- [ ] **Step 3: Apply the migration to your Supabase project**

```bash
# Via Supabase CLI (requires supabase CLI installed and project linked)
npx supabase db push

# OR paste the SQL directly into the Supabase dashboard SQL editor
# at https://supabase.com/dashboard/project/<ref>/sql
```

Expected: tables `users` and `workspace_members` exist in the database; `citext` extension enabled.

- [ ] **Step 4: Verify tables exist**

```bash
# Via Supabase CLI
npx supabase db diff
```

Expected: no pending diff (tables match migration).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0001_identity.sql
git commit -m "feat: add identity DB migration (users, workspace_members)"
```

---

## Task 3: Types and error classes

**Files:**
- Create: `src/lib/identity/types.ts`
- Create: `src/lib/identity/errors.ts`

- [ ] **Step 1: Write the failing test for error classes**

Create `src/lib/identity/__tests__/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { AuthError, ForbiddenError, NotFoundError, UsernameError } from '../errors.ts'

describe('AuthError', () => {
  it('has statusCode 401 and name AuthError', () => {
    const err = new AuthError()
    expect(err.statusCode).toBe(401)
    expect(err.name).toBe('AuthError')
    expect(err.message).toBe('Unauthorized')
  })

  it('accepts a custom message', () => {
    const err = new AuthError('token expired')
    expect(err.message).toBe('token expired')
  })
})

describe('ForbiddenError', () => {
  it('has statusCode 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403)
  })
})

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    expect(new NotFoundError().statusCode).toBe(404)
  })
})

describe('UsernameError', () => {
  it('has statusCode 400 and exposes reason', () => {
    const err = new UsernameError('rename limit reached')
    expect(err.statusCode).toBe(400)
    expect(err.reason).toBe('rename limit reached')
    expect(err.message).toContain('rename limit reached')
  })
})
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npx vitest run src/lib/identity/__tests__/errors.test.ts
```

Expected: FAIL — "Cannot find module '../errors.ts'"

- [ ] **Step 3: Create `src/lib/identity/types.ts`**

```typescript
export type User = {
  userId: string
  email: string
  username: string
}

export type WorkspaceMembership = {
  workspaceId: string
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joinedAt: Date
}

export type UserCreatedEvent = {
  type: 'user.created'
  userId: string
  email: string
  username: string
}
```

- [ ] **Step 4: Create `src/lib/identity/errors.ts`**

```typescript
export class AuthError extends Error {
  readonly statusCode = 401

  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403

  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404

  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class UsernameError extends Error {
  readonly statusCode = 400
  readonly reason: string

  constructor(reason: string) {
    super(`Username error: ${reason}`)
    this.name = 'UsernameError'
    this.reason = reason
  }
}
```

- [ ] **Step 5: Run the test — expect pass**

```bash
npx vitest run src/lib/identity/__tests__/errors.test.ts
```

Expected: PASS — 5 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/identity/types.ts src/lib/identity/errors.ts src/lib/identity/__tests__/errors.test.ts
git commit -m "feat: add identity types and error classes"
```

---

## Task 4: Supabase client module

**Files:**
- Create: `src/lib/identity/client.ts`

No tests for this task — it wraps an external service and is tested indirectly via adapter/membership tests.

- [ ] **Step 1: Create `src/lib/identity/client.ts`**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('Missing env: SUPABASE_URL')
if (!SUPABASE_ANON_KEY) throw new Error('Missing env: SUPABASE_ANON_KEY')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')

// Validates user JWTs via Supabase Auth
export function createAuthClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// Admin client for DB writes (user provisioning, username claims)
// Singleton — one instance per process
let _adminClient: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _adminClient
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/identity/client.ts
git commit -m "feat: add Supabase client factory (auth + admin)"
```

---

## Task 5: Username management

**Files:**
- Create: `src/lib/identity/username.ts`
- Create: `src/lib/identity/__tests__/username.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/identity/__tests__/username.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsernameError } from '../errors.ts'

// Must be hoisted before imports that use the module
vi.mock('../client.ts', () => ({
  getAdminClient: vi.fn(),
}))

import { getAdminClient } from '../client.ts'
import {
  sanitizeCandidate,
  isReserved,
  RESERVED_PREFIXES,
  claimUsername,
  renameUsername,
} from '../username.ts'

// ── sanitizeCandidate ────────────────────────────────────────────────────────

describe('sanitizeCandidate', () => {
  it('lowercases input', () => {
    expect(sanitizeCandidate('JohnDoe')).toBe('johndoe')
  })

  it('strips characters other than letters, digits, and hyphens', () => {
    expect(sanitizeCandidate('john.doe_42!')).toBe('johndoe-42')
  })

  it('truncates to 30 characters', () => {
    expect(sanitizeCandidate('a'.repeat(50))).toHaveLength(30)
  })

  it('returns "user" when the entire input is stripped', () => {
    expect(sanitizeCandidate('!!!')).toBe('user')
  })
})

// ── isReserved ───────────────────────────────────────────────────────────────

describe('isReserved', () => {
  it('returns true for exact reserved words', () => {
    for (const word of RESERVED_PREFIXES) {
      expect(isReserved(word)).toBe(true)
    }
  })

  it('returns true when username starts with a reserved prefix', () => {
    expect(isReserved('admin-anything')).toBe(true)
  })

  it('returns false for normal usernames', () => {
    expect(isReserved('alice')).toBe(false)
    expect(isReserved('bob-smith')).toBe(false)
  })
})

// ── claimUsername ────────────────────────────────────────────────────────────

describe('claimUsername', () => {
  let mockQuery: ReturnType<typeof buildMockQuery>

  function buildMockQuery(resolveWith: { error: null | { code: string; message: string } }) {
    return {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue(resolveWith),
    }
  }

  beforeEach(() => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => mockQuery),
    } as any)
  })

  it('updates username and returns it on first try', async () => {
    mockQuery = buildMockQuery({ error: null })
    const result = await claimUsername('user-id-1', 'alice')
    expect(result).toBe('alice')
  })

  it('appends -2 suffix on first collision and succeeds', async () => {
    let calls = 0
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(() => {
          calls++
          if (calls === 1) return Promise.resolve({ error: { code: '23505', message: 'unique' } })
          return Promise.resolve({ error: null })
        }),
      })),
    } as any)

    const result = await claimUsername('user-id-1', 'alice')
    expect(result).toBe('alice-2')
  })

  it('appends -user suffix when candidate has a reserved prefix', async () => {
    mockQuery = buildMockQuery({ error: null })
    const result = await claimUsername('user-id-1', 'admin')
    expect(result).toBe('admin-user')
  })

  it('throws on unexpected DB error', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { code: '42P01', message: 'table not found' } }),
      })),
    } as any)

    await expect(claimUsername('user-id-1', 'alice')).rejects.toThrow('table not found')
  })
})

// ── renameUsername ───────────────────────────────────────────────────────────

describe('renameUsername', () => {
  beforeEach(() => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { username_renamed_at: null },
          error: null,
        }),
      })),
    } as any)
  })

  it('returns the new username on success', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { username_renamed_at: null }, error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
    } as any)

    const result = await renameUsername('user-id-1', 'newname')
    expect(result).toBe('newname')
  })

  it('throws UsernameError when rename already used', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { username_renamed_at: '2024-01-01T00:00:00Z' },
          error: null,
        }),
      })),
    } as any)

    await expect(renameUsername('user-id-1', 'newname')).rejects.toThrow('rename limit reached')
  })

  it('throws UsernameError for reserved prefix', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { username_renamed_at: null }, error: null }),
      })),
    } as any)

    await expect(renameUsername('user-id-1', 'admin')).rejects.toThrow('username is reserved')
  })

  it('throws UsernameError when new username is already taken', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { username_renamed_at: null }, error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: { code: '23505', message: 'unique' } }),
        }),
    } as any)

    await expect(renameUsername('user-id-1', 'taken')).rejects.toThrow('username already taken')
  })
})
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
npx vitest run src/lib/identity/__tests__/username.test.ts
```

Expected: FAIL — "Cannot find module '../username.ts'"

- [ ] **Step 3: Create `src/lib/identity/username.ts`**

```typescript
import { getAdminClient } from './client.ts'
import { NotFoundError, UsernameError } from './errors.ts'

export const RESERVED_PREFIXES = [
  'admin', 'system', 'support', 'api', 'bots', 'help', 'security', 'abuse',
]

export function sanitizeCandidate(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30)
  return cleaned || 'user'
}

export function isReserved(username: string): boolean {
  return RESERVED_PREFIXES.some(
    (prefix) => username === prefix || username.startsWith(`${prefix}-`),
  )
}

// Sets the username on an existing users row (UPDATE).
// Handles collision by appending -2, -3, …
// Reserved-prefix candidates get a -user suffix before collision resolution.
export async function claimUsername(userId: string, candidate: string): Promise<string> {
  const admin = getAdminClient()
  const sanitized = sanitizeCandidate(candidate)
  const base = isReserved(sanitized) ? `${sanitized}-user` : sanitized

  let attempt = base
  let suffix = 2

  for (let i = 0; i < 100; i++) {
    const { error } = await admin
      .from('users')
      .update({ username: attempt })
      .eq('user_id', userId)

    if (!error) return attempt

    if (error.code === '23505') {
      attempt = `${base}-${suffix++}`
      continue
    }

    throw new Error(`Failed to claim username: ${error.message}`)
  }

  throw new UsernameError('could not find available username')
}

// Renames a user's username. Allowed exactly once.
export async function renameUsername(userId: string, newUsername: string): Promise<string> {
  const admin = getAdminClient()

  const { data: user, error: fetchError } = await admin
    .from('users')
    .select('username_renamed_at')
    .eq('user_id', userId)
    .single()

  if (fetchError || !user) throw new NotFoundError('user not found')
  if (user.username_renamed_at !== null) throw new UsernameError('rename limit reached')

  const sanitized = sanitizeCandidate(newUsername)
  if (sanitized === 'user' && newUsername.replace(/[^a-z0-9-]/gi, '') === '') {
    throw new UsernameError('invalid username')
  }
  if (isReserved(sanitized)) throw new UsernameError('username is reserved')

  const { error: updateError } = await admin
    .from('users')
    .update({ username: sanitized, username_renamed_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (updateError?.code === '23505') throw new UsernameError('username already taken')
  if (updateError) throw new Error(`Failed to rename username: ${updateError.message}`)

  return sanitized
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/lib/identity/__tests__/username.test.ts
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity/username.ts src/lib/identity/__tests__/username.test.ts
git commit -m "feat: add username management (claimUsername, renameUsername)"
```

---

## Task 6: Adapter core — getCurrentUser, getOptionalUser, requireAuth

**Files:**
- Create: `src/lib/identity/adapter.ts`
- Create: `src/lib/identity/__tests__/adapter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/identity/__tests__/adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client.ts', () => ({
  createAuthClient: vi.fn(),
  getAdminClient: vi.fn(),
}))
vi.mock('../username.ts', () => ({
  claimUsername: vi.fn(),
  sanitizeCandidate: vi.fn((s: string) => s),
}))

import { createAuthClient, getAdminClient } from '../client.ts'
import { claimUsername } from '../username.ts'
import { getCurrentUser, getOptionalUser, requireAuth } from '../adapter.ts'
import { AuthError } from '../errors.ts'
import type { User } from '../types.ts'

const mockUser: User = { userId: 'bots-user-1', email: 'alice@example.com', username: 'alice' }

function makeRequest(token: string | null): Request {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new Request('https://example.com', { headers })
}

function mockAuthClient(supabaseUser: object | null, error: object | null = null) {
  vi.mocked(createAuthClient).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: supabaseUser },
        error,
      }),
    },
  } as any)
}

function mockAdminLookup(dbUser: object | null) {
  vi.mocked(getAdminClient).mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: dbUser, error: dbUser ? null : { code: 'PGRST116' } }),
    })),
  } as any)
}

describe('getCurrentUser', () => {
  it('returns User for a valid JWT with an existing user row', async () => {
    mockAuthClient({ id: 'sb-user-1', email: 'alice@example.com', user_metadata: {} })
    mockAdminLookup({ user_id: 'bots-user-1', email: 'alice@example.com', username: 'alice' })

    const user = await getCurrentUser(makeRequest('valid-token'))
    expect(user).toEqual(mockUser)
  })

  it('provisions a new user row on first sign-in', async () => {
    mockAuthClient({
      id: 'sb-user-new',
      email: 'bob@example.com',
      user_metadata: { user_name: 'bobsmith' },
    })

    // First call: no existing row. Second call (after insert): returns new user.
    let callCount = 0
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
          return Promise.resolve({ data: { user_id: 'new-id', email: 'bob@example.com', username: 'bobsmith' }, error: null })
        }),
      })),
    } as any)
    vi.mocked(claimUsername).mockResolvedValue('bobsmith')

    const user = await getCurrentUser(makeRequest('new-user-token'))
    expect(user.email).toBe('bob@example.com')
    expect(claimUsername).toHaveBeenCalled()
  })

  it('throws AuthError when JWT is missing', async () => {
    await expect(getCurrentUser(makeRequest(null))).rejects.toThrow(AuthError)
  })

  it('throws AuthError when Supabase rejects the JWT', async () => {
    mockAuthClient(null, { message: 'invalid JWT' })
    await expect(getCurrentUser(makeRequest('bad-token'))).rejects.toThrow(AuthError)
  })
})

describe('getOptionalUser', () => {
  it('returns null when JWT is missing', async () => {
    const result = await getOptionalUser(makeRequest(null))
    expect(result).toBeNull()
  })

  it('returns User when JWT is valid', async () => {
    mockAuthClient({ id: 'sb-user-1', email: 'alice@example.com', user_metadata: {} })
    mockAdminLookup({ user_id: 'bots-user-1', email: 'alice@example.com', username: 'alice' })
    const result = await getOptionalUser(makeRequest('valid-token'))
    expect(result).toEqual(mockUser)
  })
})

describe('requireAuth', () => {
  it('returns User on valid token', async () => {
    mockAuthClient({ id: 'sb-user-1', email: 'alice@example.com', user_metadata: {} })
    mockAdminLookup({ user_id: 'bots-user-1', email: 'alice@example.com', username: 'alice' })
    const user = await requireAuth(makeRequest('valid-token'))
    expect(user).toEqual(mockUser)
  })

  it('throws AuthError on missing token', async () => {
    await expect(requireAuth(makeRequest(null))).rejects.toThrow(AuthError)
  })
})
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
npx vitest run src/lib/identity/__tests__/adapter.test.ts
```

Expected: FAIL — "Cannot find module '../adapter.ts'"

- [ ] **Step 3: Create `src/lib/identity/adapter.ts`**

```typescript
import { createAuthClient, getAdminClient } from './client.ts'
import { claimUsername, sanitizeCandidate } from './username.ts'
import { AuthError } from './errors.ts'
import type { User, UserCreatedEvent } from './types.ts'

function extractToken(req: Request): string | null {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7)
}

async function lookupUser(supabaseUserId: string): Promise<User | null> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('user_id, email, username')
    .eq('supabase_user_id', supabaseUserId)
    .single()

  if (error?.code === 'PGRST116') return null // row not found
  if (error) throw new Error(`DB error looking up user: ${error.message}`)
  return { userId: data.user_id, email: data.email, username: data.username }
}

function deriveCandidate(supabaseUser: { email?: string; user_metadata?: Record<string, string> }): string {
  const meta = supabaseUser.user_metadata ?? {}
  const raw = meta['user_name'] ?? meta['name'] ?? supabaseUser.email?.split('@')[0] ?? 'user'
  return sanitizeCandidate(raw)
}

function emitUserCreated(event: UserCreatedEvent): void {
  // Simple in-process event emission; consumers listen via addEventListener
  // 00-workspace-shell subscribes to 'user.created' to create the default workspace
  if (typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('user.created', { detail: event }))
  }
}

async function provisionUser(supabaseUser: {
  id: string
  email?: string
  user_metadata?: Record<string, string>
}): Promise<User> {
  const admin = getAdminClient()
  const userId = crypto.randomUUID()
  const email = supabaseUser.email ?? ''

  const { error: insertError } = await admin.from('users').insert({
    user_id: userId,
    supabase_user_id: supabaseUser.id,
    email,
  })
  if (insertError) throw new Error(`Failed to provision user: ${insertError.message}`)

  const candidate = deriveCandidate(supabaseUser)
  const username = await claimUsername(userId, candidate)

  emitUserCreated({ type: 'user.created', userId, email, username })

  return { userId, email, username }
}

async function resolveUser(token: string): Promise<User> {
  const authClient = createAuthClient()
  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user) throw new AuthError(error?.message ?? 'Invalid token')

  const existing = await lookupUser(data.user.id)
  if (existing) return existing

  return provisionUser(data.user as Parameters<typeof provisionUser>[0])
}

export async function getCurrentUser(req: Request): Promise<User> {
  const token = extractToken(req)
  if (!token) throw new AuthError('Missing Authorization header')
  return resolveUser(token)
}

export async function getOptionalUser(req: Request): Promise<User | null> {
  const token = extractToken(req)
  if (!token) return null
  try {
    return await resolveUser(token)
  } catch (err) {
    if (err instanceof AuthError) return null
    throw err
  }
}

export async function requireAuth(req: Request): Promise<User> {
  return getCurrentUser(req)
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/lib/identity/__tests__/adapter.test.ts
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity/adapter.ts src/lib/identity/__tests__/adapter.test.ts
git commit -m "feat: add adapter core (getCurrentUser, getOptionalUser, requireAuth)"
```

---

## Task 7: Membership functions

**Files:**
- Create: `src/lib/identity/membership.ts`
- Create: `src/lib/identity/__tests__/membership.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/identity/__tests__/membership.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client.ts', () => ({
  getAdminClient: vi.fn(),
}))

import { getAdminClient } from '../client.ts'
import { getWorkspaceMembership, listUserWorkspaces } from '../membership.ts'
import { NotFoundError } from '../errors.ts'
import type { WorkspaceMembership } from '../types.ts'

const mockMembership: WorkspaceMembership = {
  workspaceId: 'ws-1',
  userId: 'user-1',
  role: 'owner',
  joinedAt: new Date('2024-01-01'),
}

const mockRow = {
  workspace_id: 'ws-1',
  user_id: 'user-1',
  role: 'owner',
  joined_at: '2024-01-01T00:00:00Z',
}

describe('getWorkspaceMembership', () => {
  it('returns the membership record when found', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      })),
    } as any)

    const result = await getWorkspaceMembership('user-1', 'ws-1')
    expect(result.workspaceId).toBe('ws-1')
    expect(result.userId).toBe('user-1')
    expect(result.role).toBe('owner')
    expect(result.joinedAt).toBeInstanceOf(Date)
  })

  it('throws NotFoundError when user is not a member', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      })),
    } as any)

    await expect(getWorkspaceMembership('user-1', 'ws-missing')).rejects.toThrow(NotFoundError)
  })
})

describe('listUserWorkspaces', () => {
  it('returns all workspace memberships for a user', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [mockRow], error: null }),
      })),
    } as any)

    const results = await listUserWorkspaces('user-1')
    expect(results).toHaveLength(1)
    expect(results[0].workspaceId).toBe('ws-1')
  })

  it('returns empty array when user has no workspaces', async () => {
    vi.mocked(getAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    } as any)

    const results = await listUserWorkspaces('user-no-ws')
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
npx vitest run src/lib/identity/__tests__/membership.test.ts
```

Expected: FAIL — "Cannot find module '../membership.ts'"

- [ ] **Step 3: Create `src/lib/identity/membership.ts`**

```typescript
import { getAdminClient } from './client.ts'
import { NotFoundError } from './errors.ts'
import type { WorkspaceMembership } from './types.ts'

function rowToMembership(row: {
  workspace_id: string
  user_id: string
  role: string
  joined_at: string
}): WorkspaceMembership {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role as WorkspaceMembership['role'],
    joinedAt: new Date(row.joined_at),
  }
}

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('workspace_members')
    .select('workspace_id, user_id, role, joined_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error?.code === 'PGRST116') throw new NotFoundError('user is not a member of this workspace')
  if (error) throw new Error(`DB error fetching membership: ${error.message}`)

  return rowToMembership(data)
}

export async function listUserWorkspaces(userId: string): Promise<WorkspaceMembership[]> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('workspace_members')
    .select('workspace_id, user_id, role, joined_at')
    .eq('user_id', userId)

  if (error) throw new Error(`DB error listing workspaces: ${error.message}`)

  return (data ?? []).map(rowToMembership)
}
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npx vitest run src/lib/identity/__tests__/membership.test.ts
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity/membership.ts src/lib/identity/__tests__/membership.test.ts
git commit -m "feat: add membership functions (getWorkspaceMembership, listUserWorkspaces)"
```

---

## Task 8: Public barrel and Supabase leakage check

**Files:**
- Create: `src/lib/identity/index.ts`

- [ ] **Step 1: Create `src/lib/identity/index.ts`**

```typescript
// Public interface for the identity module.
// All other modules import from here — never from sub-files directly.
export { getCurrentUser, getOptionalUser, requireAuth } from './adapter.ts'
export { getWorkspaceMembership, listUserWorkspaces } from './membership.ts'
export { claimUsername, renameUsername } from './username.ts'
export type { User, WorkspaceMembership, UserCreatedEvent } from './types.ts'
export { AuthError, ForbiddenError, NotFoundError, UsernameError } from './errors.ts'
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

```bash
npx vitest run
```

Expected: All tests pass. Output should show something like:

```
✓ src/lib/identity/__tests__/errors.test.ts (5)
✓ src/lib/identity/__tests__/username.test.ts (8)
✓ src/lib/identity/__tests__/adapter.test.ts (6)
✓ src/lib/identity/__tests__/membership.test.ts (4)

Test Files  4 passed (4)
Tests       23 passed (23)
```

- [ ] **Step 3: Verify Supabase Auth is not imported outside the identity module**

```bash
grep -r "from '@supabase/supabase-js'" src/ --include="*.ts" | grep -v "src/lib/identity/"
```

Expected: no output (zero matches). If any line appears, that file is importing Supabase Auth directly and must be updated to import from `src/lib/identity/index.ts` instead.

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity/index.ts
git commit -m "feat: add identity public barrel (index.ts)"
```

---

## Completion checklist

After all tasks are done, verify:

- [ ] `npx vitest run` passes with zero failures
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `grep -r "from '@supabase/supabase-js'" src/ --include="*.ts" | grep -v "src/lib/identity/"` returns empty
- [ ] `db/migrations/0001_identity.sql` is applied to the Supabase project
- [ ] `.env.example` is committed; `.env` is gitignored


## UI direction requirement (OpenUI)

All user-facing bots.ac UI work should be driven by OpenUI (`https://www.openui.com/`) rather than hand-authored static chat rendering. Plan updates and sub-specs should assume:

- OpenUI Lang as the LLM response format for generative UI (not markdown/JSON fallbacks by default).
- A component-library-first contract (`defineComponent`/library prompt generation) so UI surfaces are bounded and safe.
- Streaming render via OpenUI parser/renderer so structure appears before data is complete.
- Build/dev scripts regenerate system prompt (`openui generate`) from the component library as part of normal workflows.

When drafting implementation plans, add explicit tasks for:
1. Defining the component library entrypoint for each UI surface.
2. Generating and versioning the OpenUI system prompt artifact.
3. Wiring backend chat routes to include the generated OpenUI prompt and stream OpenUI Lang responses.
4. Rendering those responses with OpenUI runtime components in the client.
