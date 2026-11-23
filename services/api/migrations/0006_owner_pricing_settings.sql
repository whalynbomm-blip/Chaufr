-- Owner-managed pricing configuration. Safe to apply even where the activation table
-- was created by an earlier deployment migration.
CREATE TABLE IF NOT EXISTS driver_daily_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES driver_profiles(user_id) ON DELETE CASCADE,
  operating_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_provider TEXT,
  provider_reference TEXT,
  paid_at TIMESTAMPTZ,
  non_refundable_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_user_id, operating_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS driver_activation_provider_reference
  ON driver_daily_activations(payment_provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform_pricing_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton = true),
  config JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
