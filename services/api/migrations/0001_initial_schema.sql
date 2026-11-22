-- Chaufr PostgreSQL initial schema.
-- Apply through a migration runner after provisioning a PostgreSQL database.
-- Do not store passwords or raw payment credentials in these tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone_e164 TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('passenger', 'driver', 'owner', 'operations')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')),
  licence_number_encrypted BYTEA,
  rating NUMERIC(3,2) CHECK (rating BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES driver_profiles(user_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('standard', 'comfort', 'xl')),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  registration_encrypted BYTEA NOT NULL,
  fuel_consumption_l_per_100km NUMERIC(6,2) NOT NULL CHECK (fuel_consumption_l_per_100km > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fare_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  base_fare NUMERIC(12,2) NOT NULL CHECK (base_fare >= 0),
  per_km_rate NUMERIC(12,2) NOT NULL CHECK (per_km_rate >= 0),
  per_minute_rate NUMERIC(12,2) NOT NULL CHECK (per_minute_rate >= 0),
  operating_cost_per_km NUMERIC(12,2) NOT NULL CHECK (operating_cost_per_km >= 0),
  commission_rate NUMERIC(6,5) NOT NULL CHECK (commission_rate >= 0 AND commission_rate < 1),
  minimum_fare NUMERIC(12,2) NOT NULL CHECK (minimum_fare >= 0),
  fuel_price_per_litre NUMERIC(12,3) NOT NULL CHECK (fuel_price_per_litre >= 0),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_fare_rule
  ON fare_rules ((is_active)) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id UUID NOT NULL REFERENCES users(id),
  driver_user_id UUID REFERENCES users(id),
  vehicle_id UUID REFERENCES vehicles(id),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('quoted', 'requested', 'offered', 'accepted', 'driver_arriving', 'in_progress', 'completed', 'cancelled', 'expired')),
  pickup_label TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  distance_km NUMERIC(8,2) NOT NULL CHECK (distance_km >= 0),
  duration_minutes NUMERIC(8,2) NOT NULL CHECK (duration_minutes >= 0),
  fare_rule_id UUID REFERENCES fare_rules(id),
  quoted_total NUMERIC(12,2) NOT NULL CHECK (quoted_total >= 0),
  driver_earnings NUMERIC(12,2) NOT NULL CHECK (driver_earnings >= 0),
  platform_commission NUMERIC(12,2) NOT NULL CHECK (platform_commission >= 0),
  quote_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  quote_expires_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS trips_passenger_recent ON trips(passenger_user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS trips_driver_recent ON trips(driver_user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS trips_dispatch_queue ON trips(status, requested_at) WHERE status IN ('requested', 'offered');

CREATE TABLE IF NOT EXISTS trip_events (
  id BIGSERIAL PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
