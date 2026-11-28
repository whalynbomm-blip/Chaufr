CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 3 AND 120),
  message text NOT NULL CHECK (length(message) BETWEEN 10 AND 3000),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('trip','payment','account','safety','general')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  owner_reply text CHECK (owner_reply IS NULL OR length(owner_reply) <= 3000),
  replied_by uuid REFERENCES users(id),
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx ON support_tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx ON support_tickets(status,created_at DESC);
