ALTER TABLE scheduled_rides ADD COLUMN IF NOT EXISTS recurring_rule_id UUID REFERENCES recurring_ride_rules(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_rides_recurring_unique_idx ON scheduled_rides(recurring_rule_id, scheduled_for) WHERE recurring_rule_id IS NOT NULL;
