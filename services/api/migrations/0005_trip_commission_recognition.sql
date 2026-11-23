-- Recognize the stored 12% trip commission only when a trip completes.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS commission_earned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS completed_trip_commission_ledger
  ON trips(completed_at DESC)
  WHERE status = 'completed' AND commission_earned_at IS NOT NULL;
