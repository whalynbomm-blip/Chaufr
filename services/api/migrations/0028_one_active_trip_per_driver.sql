-- Enforce one active trip per driver at the database layer.
-- This closes the race where two concurrent accept operations could both pass
-- an application-level "no active trip" check.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_trip_per_driver
  ON trips(driver_user_id)
  WHERE driver_user_id IS NOT NULL
    AND status IN ('accepted', 'driver_arriving', 'in_progress');
