BEGIN;

CREATE TABLE IF NOT EXISTS workspace_billing_config_versions (
  billing_config_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  config_json JSONB NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_billing_config_version_id UUID,
  UNIQUE (workspace_id, version),
  UNIQUE (workspace_id, billing_config_version_id),
  FOREIGN KEY (workspace_id, supersedes_billing_config_version_id)
    REFERENCES workspace_billing_config_versions (workspace_id, billing_config_version_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_workspace_billing_config_versions_workspace_created_at
  ON workspace_billing_config_versions (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS run_budget_snapshots (
  run_budget_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL UNIQUE,
  billing_config_version_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('explicit', 'inherited')),
  run_hard_budget_usd NUMERIC(14, 6) NOT NULL CHECK (run_hard_budget_usd >= 0),
  run_soft_budget_usd NUMERIC(14, 6) NOT NULL CHECK (run_soft_budget_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (run_soft_budget_usd <= run_hard_budget_usd),
  FOREIGN KEY (workspace_id, billing_config_version_id)
    REFERENCES workspace_billing_config_versions (workspace_id, billing_config_version_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_run_budget_snapshots_workspace_created_at
  ON run_budget_snapshots (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cost_events (
  cost_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (idempotency_key <> ''),
  agent_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  billable_category TEXT NOT NULL CHECK (billable_category = 'model'),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  token_usage_json JSONB NOT NULL,
  pricing_source TEXT NOT NULL CHECK (pricing_source IN ('provider_metadata', 'fallback_catalog')),
  pricing_reference TEXT NOT NULL,
  estimated_usd NUMERIC(14, 6) CHECK (estimated_usd IS NULL OR estimated_usd >= 0),
  actual_usd NUMERIC(14, 6) NOT NULL CHECK (actual_usd >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  billable_to_customer BOOLEAN NOT NULL,
  is_byo_key_spend BOOLEAN NOT NULL,
  attempt_outcome TEXT NOT NULL CHECK (attempt_outcome IN ('succeeded', 'failed', 'aborted', 'rate_limited', 'timed_out')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_cost_events_run_occurred_at
  ON cost_events (run_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_events_workspace_occurred_at
  ON cost_events (workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_events_agent_occurred_at
  ON cost_events (agent_id, occurred_at DESC);

COMMIT;
