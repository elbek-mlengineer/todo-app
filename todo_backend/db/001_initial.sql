CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  locale text NOT NULL DEFAULT 'uz' CHECK (locale IN ('uz','en')),
  timezone text NOT NULL DEFAULT 'Asia/Tashkent',
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark','forest','lavender','sunset','ocean')),
  pro_until timestamptz,
  telegram_chat_id text UNIQUE,
  telegram_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identities (
  provider text NOT NULL CHECK (provider IN ('google','telegram')),
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject),
  UNIQUE (user_id, provider)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  provider text NOT NULL,
  verifier text NOT NULL,
  nonce text NOT NULL,
  link_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  category text NOT NULL DEFAULT 'personal' CHECK (category IN ('personal','work','learning','other')),
  completed boolean NOT NULL DEFAULT false,
  due_at timestamptz,
  reminder boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_due ON tasks(user_id, due_at);
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('soon','due')),
  deliver_at timestamptz NOT NULL,
  UNIQUE (task_id,revision,kind)
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders(deliver_at);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  telegram_status text NOT NULL DEFAULT 'skip',
  telegram_attempts integer NOT NULL DEFAULT 0,
  telegram_retry_at timestamptz NOT NULL DEFAULT now(),
  telegram_lease_until timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  price_uzs integer NOT NULL CHECK (price_uzs > 0),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 3660),
  receipt bytea NOT NULL,
  receipt_type text NOT NULL,
  note text NOT NULL DEFAULT '',
  review_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_payment ON payments(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS payments_status ON payments(status,created_at DESC);
