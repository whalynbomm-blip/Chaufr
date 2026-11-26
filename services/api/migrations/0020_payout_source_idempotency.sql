CREATE UNIQUE INDEX IF NOT EXISTS driver_payouts_source_once
  ON driver_payouts(source_type, source_id)
  WHERE source_id IS NOT NULL;
