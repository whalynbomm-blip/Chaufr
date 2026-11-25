-- Store one or more FCM device tokens per Chaufr account.
CREATE TABLE IF NOT EXISTS push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('android')),
  device_label text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_user_active ON push_devices(user_id, last_seen_at DESC) WHERE is_active = true;
