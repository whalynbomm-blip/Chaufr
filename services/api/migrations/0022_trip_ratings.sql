CREATE TABLE IF NOT EXISTS trip_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rater_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rated_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rater_role text NOT NULL CHECK (rater_role IN ('passenger','driver')),
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, rater_user_id),
  CHECK (rater_user_id <> rated_user_id)
);
CREATE INDEX IF NOT EXISTS trip_ratings_rated_user_created_idx
  ON trip_ratings(rated_user_id, created_at DESC);
