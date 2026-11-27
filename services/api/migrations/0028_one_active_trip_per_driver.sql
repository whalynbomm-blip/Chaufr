-- Enforce one active trip per driver at the database layer.
-- This closes the race where two concurrent accept operations could both pass
-- an application-level "no active trip" check.
--
-- Fail with an actionable message rather than changing existing trip records
-- if historical data already contains multiple active trips for one driver.
DO $$
DECLARE
  conflicting_drivers text;
BEGIN
  SELECT string_agg(driver_user_id::text, ', ' ORDER BY driver_user_id::text)
    INTO conflicting_drivers
  FROM (
    SELECT driver_user_id
    FROM trips
    WHERE driver_user_id IS NOT NULL
      AND status IN ('accepted', 'driver_arriving', 'in_progress')
    GROUP BY driver_user_id
    HAVING COUNT(*) > 1
  ) conflicts;

  IF conflicting_drivers IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot apply migration 0028: drivers have multiple active trips. Resolve these driver IDs first: %',
      conflicting_drivers;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_trip_per_driver
  ON trips(driver_user_id)
  WHERE driver_user_id IS NOT NULL
    AND status IN ('accepted', 'driver_arriving', 'in_progress');
