-- RungoMX Pro Subscriptions + Promotions (V1)
-- Applied to Neon project "rungomx" branches: dev, test

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_key varchar(50) NOT NULL,
  status varchar(20) NOT NULL,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  ended_at timestamptz,
  provider varchar(50),
  provider_customer_id varchar(255),
  provider_subscription_id varchar(255),
  provider_price_id varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_trial_window_check
    CHECK (trial_ends_at > trial_starts_at);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_period_window_check
    CHECK (current_period_ends_at > current_period_starts_at);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_user_id_idx
  ON billing_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS billing_subscriptions_trial_ends_at_idx
  ON billing_subscriptions (trial_ends_at);
CREATE INDEX IF NOT EXISTS billing_subscriptions_current_period_ends_at_idx
  ON billing_subscriptions (current_period_ends_at);
CREATE INDEX IF NOT EXISTS billing_subscriptions_ended_at_idx
  ON billing_subscriptions (ended_at);

CREATE TABLE IF NOT EXISTS billing_trial_uses (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL,
  source varchar(20),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement_key varchar(50) NOT NULL DEFAULT 'pro_access',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  source_type varchar(30) NOT NULL,
  source_id uuid,
  reason text,
  granted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE billing_entitlement_overrides
    ADD CONSTRAINT billing_entitlement_overrides_window_check
    CHECK (ends_at > starts_at);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS billing_entitlement_overrides_user_entitlement_idx
  ON billing_entitlement_overrides (user_id, entitlement_key);
CREATE INDEX IF NOT EXISTS billing_entitlement_overrides_user_entitlement_range_idx
  ON billing_entitlement_overrides (user_id, entitlement_key, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(50),
  source varchar(20) NOT NULL,
  type varchar(50) NOT NULL,
  external_event_id varchar(255),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type varchar(50) NOT NULL,
  entity_id uuid,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id varchar(100),
  idempotency_key varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_external_event_id_idx
  ON billing_events (provider, external_event_id);
CREATE INDEX IF NOT EXISTS billing_events_user_id_idx
  ON billing_events (user_id);

CREATE TABLE IF NOT EXISTS billing_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash_version integer NOT NULL,
  code_hash varchar(64) NOT NULL,
  code_prefix varchar(16),
  name varchar(255),
  description text,
  entitlement_key varchar(50) NOT NULL DEFAULT 'pro_access',
  grant_duration_days integer,
  grant_fixed_ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_to timestamptz,
  max_redemptions integer,
  per_user_max_redemptions integer NOT NULL DEFAULT 1,
  redemption_count integer NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE billing_promotions
    ADD CONSTRAINT billing_promotions_grant_exclusive_check
    CHECK ((grant_duration_days IS NULL) <> (grant_fixed_ends_at IS NULL));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS billing_promotions_code_hash_idx
  ON billing_promotions (code_hash);
CREATE INDEX IF NOT EXISTS billing_promotions_active_valid_idx
  ON billing_promotions (is_active, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS billing_promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES billing_promotions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_promotion_redemptions_promotion_user_idx
  ON billing_promotion_redemptions (promotion_id, user_id);

CREATE TABLE IF NOT EXISTS billing_pending_entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash_version integer NOT NULL,
  email_hash varchar(64) NOT NULL,
  entitlement_key varchar(50) NOT NULL DEFAULT 'pro_access',
  grant_duration_days integer,
  grant_fixed_ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  claim_valid_from timestamptz,
  claim_valid_to timestamptz,
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  claim_source varchar(50),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE billing_pending_entitlement_grants
    ADD CONSTRAINT billing_pending_entitlement_grants_grant_exclusive_check
    CHECK ((grant_duration_days IS NULL) <> (grant_fixed_ends_at IS NULL));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS billing_pending_entitlement_grants_email_active_idx
  ON billing_pending_entitlement_grants (email_hash, is_active, claimed_at);
