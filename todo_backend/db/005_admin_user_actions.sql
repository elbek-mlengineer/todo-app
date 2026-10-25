CREATE TABLE admin_user_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 target_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('update','delete')),
 details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_user_actions_target ON admin_user_actions(target_id,created_at DESC);
