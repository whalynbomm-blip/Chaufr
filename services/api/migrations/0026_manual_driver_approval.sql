-- Expand Chaufr's owner-managed South African driver document checklist.
ALTER TABLE driver_verification_documents
  DROP CONSTRAINT IF EXISTS driver_verification_documents_document_type_check;
ALTER TABLE driver_verification_documents
  ADD CONSTRAINT driver_verification_documents_document_type_check
  CHECK (document_type IN (
    'south_african_id','passport','drivers_licence','proof_of_address',
    'prdp','saps_criminal_record','pending_investigation_declaration',
    'vehicle_registration','vehicle_roadworthy','vehicle_operating_licence',
    'bank_confirmation'
  ));
ALTER TABLE driver_verification_documents
  ADD COLUMN IF NOT EXISTS expiry_date DATE;
CREATE INDEX IF NOT EXISTS driver_verification_documents_expiry_idx
  ON driver_verification_documents(expiry_date)
  WHERE expiry_date IS NOT NULL;
