CREATE TABLE checkout_idempotency (
  idempotency_key UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  checkout_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checkout_idempotency_user_created_idx ON checkout_idempotency(user_id, created_at DESC);
