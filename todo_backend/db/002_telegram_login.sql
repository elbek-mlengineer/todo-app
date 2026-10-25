CREATE TABLE telegram_login_challenges (
 token_hash text PRIMARY KEY,
 browser_hash text NOT NULL UNIQUE,
 link_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 locale text NOT NULL CHECK (locale IN ('uz','en')),
 telegram_id text,
 telegram_name text,
 code_hash text,
 attempts integer NOT NULL DEFAULT 0,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes'
);
CREATE INDEX telegram_login_expiry ON telegram_login_challenges(expires_at);
CREATE TABLE telegram_poll_offsets (bot_id text PRIMARY KEY, next_offset bigint NOT NULL DEFAULT 0);
CREATE TABLE telegram_login_throttle (telegram_id text PRIMARY KEY, sent_at timestamptz NOT NULL DEFAULT now());
