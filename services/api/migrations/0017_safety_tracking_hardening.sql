ALTER TABLE scheduled_rides DROP CONSTRAINT IF EXISTS scheduled_rides_scheduled_for_check;

CREATE TABLE IF NOT EXISTS driver_trip_location_samples (
  id BIGSERIAL PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_trip_location_samples_recent_idx
  ON driver_trip_location_samples(trip_id, recorded_at DESC);
