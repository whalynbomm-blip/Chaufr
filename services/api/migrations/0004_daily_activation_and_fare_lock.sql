-- Daily driver activation fee and immutable accepted-trip fare snapshots.
-- A paid activation is unique per driver and South African operating date.
CREATE TABLE IF NOT EXISTS driver_daily_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES driver_profiles(user_id) ON DELETE CASCADE,
  operating_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount = 30.00),
  currency CHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  payment_provider TEXT,
  provider_reference TEXT UNIQUE,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  non_refundable_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_user_id, operating_date),
  CHECK ((status = 'paid' AND paid_at IS NOT NULL AND non_refundable_at IS NOT NULL)
      OR status <> 'paid')
);

CREATE INDEX IF NOT EXISTS driver_daily_activations_paid_today
  ON driver_daily_activations(driver_user_id, operating_date)
  WHERE status = 'paid';

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS traffic_level TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS fare_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fare_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,5) NOT NULL DEFAULT 0.12
    CHECK (commission_rate >= 0 AND commission_rate < 1);
