-- Chaufr sequential smart-dispatch safeguards.
-- One trip may have only one live offer at a time. This prevents a passenger
-- request being broadcast to multiple drivers and keeps assignment deterministic.
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_offer_per_trip
  ON trip_offers(trip_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS trip_offers_expiry_queue
  ON trip_offers(expires_at, trip_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS driver_presence_recent_online
  ON driver_presence(last_seen_at DESC, driver_user_id)
  WHERE is_online = true;
