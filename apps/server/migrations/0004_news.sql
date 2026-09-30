-- Official news for the Updates feed: Federal Register documents from USCIS and items from USCIS
-- feeds. Public text and links only; nothing here is personal. Kept to the newest 500 items.
CREATE TABLE news_items (
  -- "federal-register:<document number>" or "uscis-feed:<hash of the feed's guid or link>".
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  -- Document type as published, for example Rule, Proposed Rule, Notice, News release.
  kind TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  -- Text taken from the source; empty when the source gives none.
  summary TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  published_on TEXT NOT NULL,
  category TEXT NOT NULL,
  -- JSON array of form numbers found in the title or summary, for example ["I-485"].
  forms TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX news_items_published ON news_items (published_on);
