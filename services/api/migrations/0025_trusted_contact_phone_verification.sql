-- Verify trusted-contact phone ownership before emergency SMS delivery.
ALTER TABLE trusted_contacts
  ADD COLUMN IF NOT EXISTS verification_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (verification_attempts BETWEEN 0 AND 5);
