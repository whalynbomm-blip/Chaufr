-- Financial operations, bank payout profiles and encrypted driver verification documents.
ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS checkout_access_code TEXT;

CREATE TABLE IF NOT EXISTS payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  passenger_user_id UUID NOT NULL REFERENCES users(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','processed','failed','rejected')),
  provider_reference TEXT UNIQUE,
  provider_refund_id TEXT,
  requested_by UUID NOT NULL REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_refunds_trip_idx ON payment_refunds(trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS driver_payout_accounts (
  driver_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number_encrypted BYTEA NOT NULL,
  account_name TEXT NOT NULL,
  paystack_recipient_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('reward_commission','driver_earnings','manual_adjustment')),
  source_id UUID,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','paid','failed','reversed','cancelled')),
  provider_reference TEXT NOT NULL UNIQUE,
  provider_transfer_code TEXT,
  failure_reason TEXT,
  initiated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_payouts_driver_idx ON driver_payouts(driver_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS driver_verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('south_african_id','passport','drivers_licence','proof_of_address','vehicle_registration','vehicle_roadworthy')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 6291456),
  encrypted_content BYTEA NOT NULL,
  encryption_iv BYTEA NOT NULL,
  encryption_tag BYTEA NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_review','approved','rejected')),
  reviewer_user_id UUID REFERENCES users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS driver_verification_documents_queue_idx ON driver_verification_documents(status, created_at);
