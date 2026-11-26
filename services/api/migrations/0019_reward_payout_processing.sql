ALTER TABLE reward_driver_commission_requests
  DROP CONSTRAINT IF EXISTS reward_driver_commission_requests_status_check;
ALTER TABLE reward_driver_commission_requests
  ADD CONSTRAINT reward_driver_commission_requests_status_check
  CHECK (status IN ('requested','approved','processing','paid','rejected'));
