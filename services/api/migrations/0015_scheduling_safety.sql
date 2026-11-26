-- Scheduling, recurring rides and Safety Shield extensions.
CREATE TABLE IF NOT EXISTS scheduled_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  pickup_label TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  origin JSONB NOT NULL,
  destination JSONB NOT NULL,
  route_quote_token TEXT NOT NULL,
  vehicle_category TEXT NOT NULL,
  service_tier TEXT NOT NULL DEFAULT 'standard' CHECK (service_tier IN ('saver','standard','priority')),
  redeem_reward BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','dispatching','dispatched','cancelled','failed')),
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scheduled_for > now() + interval '15 minutes')
);
CREATE INDEX IF NOT EXISTS scheduled_rides_due_idx ON scheduled_rides(status, scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_rides_passenger_idx ON scheduled_rides(passenger_user_id, scheduled_for DESC);

CREATE TABLE IF NOT EXISTS recurring_ride_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_label TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  origin JSONB NOT NULL,
  destination JSONB NOT NULL,
  route_quote_token TEXT NOT NULL,
  vehicle_category TEXT NOT NULL,
  service_tier TEXT NOT NULL DEFAULT 'standard' CHECK (service_tier IN ('saver','standard','priority')),
  weekdays SMALLINT[] NOT NULL CHECK (cardinality(weekdays) BETWEEN 1 AND 7),
  local_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  redeem_reward BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND ends_on <= starts_on + 180)
);
CREATE INDEX IF NOT EXISTS recurring_ride_rules_passenger_idx ON recurring_ride_rules(passenger_user_id, status);

CREATE TABLE IF NOT EXISTS scheduled_ride_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES recurring_ride_rules(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','dispatching','dispatched','cancelled','failed')),
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rule_id, scheduled_for)
);
CREATE INDEX IF NOT EXISTS scheduled_occurrences_due_idx ON scheduled_ride_occurrences(status, scheduled_for);

CREATE TABLE IF NOT EXISTS trusted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_e164)
);
CREATE INDEX IF NOT EXISTS trusted_contacts_user_idx ON trusted_contacts(user_id);

CREATE TABLE IF NOT EXISTS trip_safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sos','route_deviation','unusual_stop','share_created')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_safety_events_trip_idx ON trip_safety_events(trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trip_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_share_tokens_trip_idx ON trip_share_tokens(trip_id);
