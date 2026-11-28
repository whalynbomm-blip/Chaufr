DROP INDEX IF EXISTS driver_payouts_source_once;
CREATE UNIQUE INDEX driver_payouts_source_once
  ON driver_payouts(source_type, source_id)
  WHERE source_id IS NOT NULL AND status IN ('queued','processing','paid');
