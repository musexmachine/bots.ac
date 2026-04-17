BEGIN;

CREATE TABLE IF NOT EXISTS workspace_policy_versions (
  policy_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  policy_json JSONB NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_policy_version_id UUID,
  UNIQUE (workspace_id, version),
  UNIQUE (workspace_id, policy_version_id),
  FOREIGN KEY (workspace_id, supersedes_policy_version_id)
    REFERENCES workspace_policy_versions (workspace_id, policy_version_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_policy_versions_workspace_created_at
  ON workspace_policy_versions (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_policy_exceptions (
  policy_exception_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL,
  policy_version_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_fingerprint TEXT NOT NULL,
  target_json JSONB NOT NULL,
  approved_by_user_id UUID NOT NULL REFERENCES users(user_id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  CHECK (target_fingerprint <> ''),
  FOREIGN KEY (workspace_id, policy_version_id)
    REFERENCES workspace_policy_versions (workspace_id, policy_version_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_policy_exceptions_active_run_target
  ON workspace_policy_exceptions (run_id, target_fingerprint)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_policy_exceptions_run_lookup
  ON workspace_policy_exceptions (run_id, target_fingerprint, consumed_at);

COMMIT;
