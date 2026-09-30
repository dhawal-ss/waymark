-- Waymark sync server schema. Receipt numbers are stored encrypted (enc) and looked up by a keyed
-- HMAC (hmac). Case data is stored encrypted and only when it changes.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE receipts (
  hmac TEXT PRIMARY KEY,
  enc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_checked_at TEXT,
  last_hash TEXT,
  last_change_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX receipts_due ON receipts (last_checked_at);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  receipt_hmac TEXT NOT NULL REFERENCES receipts (hmac),
  created_at TEXT NOT NULL,
  UNIQUE (account_id, receipt_hmac)
);

CREATE INDEX subscriptions_receipt ON subscriptions (receipt_hmac);

CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_hmac TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  hash TEXT NOT NULL,
  enc TEXT NOT NULL
);

CREATE INDEX snapshots_receipt ON snapshots (receipt_hmac, id);

CREATE TABLE usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL
);
