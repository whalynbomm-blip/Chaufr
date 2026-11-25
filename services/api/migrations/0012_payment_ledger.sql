-- Provider-neutral payment records. Provider callbacks must be authenticated before these
-- service methods are called; never store card numbers, CVVs or bank credentials.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded'));

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  trip_id UUID REFERENCES trips(id),
  activation_id UUID REFERENCES driver_daily_activations(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('passenger_trip', 'driver_activation')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  provider TEXT,
  provider_reference TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((purpose = 'passenger_trip' AND trip_id IS NOT NULL AND activation_id IS NULL)
      OR (purpose = 'driver_activation' AND activation_id IS NOT NULL AND trip_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_reference
  ON payment_intents(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_intents_user_recent
  ON payment_intents(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_provider_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_intent_id UUID REFERENCES payment_intents(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

CREATE TABLE IF NOT EXISTS financial_ledger (
  id BIGSERIAL PRIMARY KEY,
  payment_intent_id UUID REFERENCES payment_intents(id),
  trip_id UUID REFERENCES trips(id),
  account_type TEXT NOT NULL CHECK (account_type IN ('passenger_payment', 'driver_activation_revenue', 'platform_commission', 'driver_earnings', 'refund')),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  source_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_type, source_reference)
);
CREATE INDEX IF NOT EXISTS financial_ledger_trip_recent
  ON financial_ledger(trip_id, created_at DESC);
