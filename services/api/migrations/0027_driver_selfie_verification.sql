-- Add a personal selfie as the second mandatory evidence item for manual driver identity review.
ALTER TABLE driver_verification_documents
  DROP CONSTRAINT IF EXISTS driver_verification_documents_document_type_check;
ALTER TABLE driver_verification_documents
  ADD CONSTRAINT driver_verification_documents_document_type_check
  CHECK (document_type IN (
    'south_african_id','passport','drivers_licence','driver_selfie','proof_of_address',
    'prdp','saps_criminal_record','pending_investigation_declaration',
    'vehicle_registration','vehicle_roadworthy','vehicle_operating_licence',
    'bank_confirmation'
  ));
