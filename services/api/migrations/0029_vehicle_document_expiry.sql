-- Track expiry dates for mandatory vehicle compliance documents.
ALTER TABLE driver_verification_documents
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Vehicle roadworthy certificates and operating licences must carry an expiry date.
-- Existing records remain NULL and must be resubmitted before the driver can go online.
