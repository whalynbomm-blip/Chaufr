-- Passenger loyalty tickets: one ticket per completed trip; nine tickets redeem one
-- free passenger fare for an eligible 5-20 minute route.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS passenger_payable NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE trips SET passenger_payable = quoted_total
WHERE passenger_payable = 0 AND quoted_total > 0;

CREATE TABLE IF NOT EXISTS passenger_reward_accounts (
  passenger_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tickets_balance INTEGER NOT NULL DEFAULT 0 CHECK (tickets_balance >= 0),
  tickets_earned_total INTEGER NOT NULL DEFAULT 0 CHECK (tickets_earned_total >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passenger_reward_ledger (
  id BIGSERIAL PRIMARY KEY,
  passenger_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earned', 'redeemed', 'released')),
  tickets_delta INTEGER NOT NULL CHECK (tickets_delta <> 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, entry_type)
);

CREATE TABLE IF NOT EXISTS passenger_reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  tickets_reserved INTEGER NOT NULL DEFAULT 9 CHECK (tickets_reserved = 9),
  fare_covered NUMERIC(12,2) NOT NULL CHECK (fare_covered >= 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS passenger_reward_ledger_recent
  ON passenger_reward_ledger(passenger_user_id, created_at DESC);
