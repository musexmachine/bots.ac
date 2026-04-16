BEGIN;

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
  username_renamed_at TIMESTAMPTZ, -- NULL until the one allowed rename is used
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

-- Support listUserWorkspaces: the composite PK leads with workspace_id,
-- so a separate index is needed for lookups by user_id alone.
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
  ON workspace_members (user_id);

COMMIT;
