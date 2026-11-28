-- Keep the vehicle compliance expiry-date schema contract explicit and idempotent.
-- Migration 0026 introduced this column; this guard supports databases that may
-- have been provisioned from an older migration snapshot.
ALTER TABLE driver_verification_documents
  ADD COLUMN IF NOT EXISTS expiry_date DATE;
