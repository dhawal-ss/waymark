-- When a receipt nobody tracks any more was last checked, kept only for the refresh cooldown so
-- deleting and re-adding a receipt cannot skip it. Holds the keyed HMAC, never the receipt.
CREATE TABLE recent_checks (
  hmac TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL
);
