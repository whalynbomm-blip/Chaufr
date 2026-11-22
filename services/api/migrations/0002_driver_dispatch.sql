-- Chaufr driver availability and dispatch offer tables.
-- Apply after 0001_initial_schema.sql.
-- Runtime API integration and authenticated access are separate milestones.

CREATE TABLE IF NOT EXISTS driver_presence (
  driver_user_id UUID PRIMARY KEY REFERENCES driver_profiles(user_id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  location_accuracy_m NUMERIC(8,2),
  last_seen_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
  CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0)
);

CREATE INDEX IF NOT EXISTS driver_presence_online_recent
  ON driver_presence(is_online, last_seen_at DESC)
  WHERE is_online = true;

CREATE TABLE IF NOT EXISTS trip_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES driver_profiles(user_id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > offered_at),
  CHECK (
    (status = 'pending' AND responded_at IS NULL) OR
    (status <> 'pending' AND responded_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS trip_offers_driver_pending
  ON trip_offers(driver_user_id, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS trip_offers_trip_recent
  ON trip_offers(trip_id, offered_at DESC);

-- A driver can only receive one active offer for a given trip.
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_offer_per_driver_trip
  ON trip_offers(trip_id, driver_user_id)
  WHERE status = 'pending';
