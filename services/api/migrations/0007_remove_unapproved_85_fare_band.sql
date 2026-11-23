-- Remove the unapproved R85 / 16–22 minute fare band from saved owner pricing.
-- The next approved band (29 minutes, R100 starting fare) now covers that duration.
UPDATE platform_pricing_settings
SET config = jsonb_set(
  config,
  '{durationFareBands}',
  COALESCE(
    (
      SELECT jsonb_agg(band ORDER BY (band->>'maxMinutes')::integer)
      FROM jsonb_array_elements(config->'durationFareBands') AS items(band)
      WHERE (band->>'maxMinutes')::integer <> 22
    ),
    '[]'::jsonb
  ),
  true
),
version = version + 1,
updated_at = now()
WHERE jsonb_typeof(config->'durationFareBands') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(config->'durationFareBands') AS items(band)
    WHERE (band->>'maxMinutes')::integer = 22
  );
