ALTER TABLE scheduled_rides
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS scheduled_rides_reminder_due_idx
  ON scheduled_rides(scheduled_for)
  WHERE status='scheduled' AND reminder_sent_at IS NULL;
