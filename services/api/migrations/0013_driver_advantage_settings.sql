-- Chaufr Advantage driver settings. Safe defaults preserve existing dispatch behavior.
CREATE TABLE IF NOT EXISTS driver_advantage_settings (
  driver_user_id UUID PRIMARY KEY REFERENCES driver_profiles(user_id) ON DELETE CASCADE,
  preferred_area_labels TEXT[] NOT NULL DEFAULT '{}',
  minimum_net_per_trip NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (minimum_net_per_trip >= 0),
  maximum_pickup_distance_km NUMERIC(8,2) NOT NULL DEFAULT 15 CHECK (maximum_pickup_distance_km BETWEEN 0 AND 100),
  fuel_price_per_litre NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (fuel_price_per_litre >= 0),
  operating_cost_per_km NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (operating_cost_per_km >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
