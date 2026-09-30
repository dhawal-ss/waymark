-- Public data from official sources. Nothing here is personal.

-- Processing time pages to check (form, office, subtype), managed through the admin API.
CREATE TABLE pt_targets (
  form TEXT NOT NULL,
  office TEXT NOT NULL,
  subtype TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  last_checked_at TEXT,
  last_error TEXT,
  PRIMARY KEY (form, office, subtype)
);

-- One row per distinct published value. Daily checks only move last_seen_at forward.
CREATE TABLE processing_times (
  form TEXT NOT NULL,
  office TEXT NOT NULL,
  subtype TEXT NOT NULL,
  -- Publication date from USCIS, or the fetch date when the response has none (date_from_source = 0).
  published_date TEXT NOT NULL,
  date_from_source INTEGER NOT NULL,
  months REAL NOT NULL,
  low_months REAL,
  subtype_label TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (form, office, subtype, published_date, months)
);

CREATE TABLE visa_bulletin (
  month TEXT NOT NULL,
  chart TEXT NOT NULL,
  preference TEXT NOT NULL,
  category TEXT NOT NULL,
  country TEXT NOT NULL,
  cutoff TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (month, chart, preference, category, country)
);

CREATE TABLE form_stats (
  quarter TEXT NOT NULL,
  form TEXT NOT NULL,
  office TEXT NOT NULL,
  received INTEGER,
  approved INTEGER,
  denied INTEGER,
  pending INTEGER,
  source_url TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (quarter, form, office)
);

CREATE INDEX form_stats_form ON form_stats (form, quarter);

CREATE TABLE data_runs (
  dataset TEXT PRIMARY KEY,
  last_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT
);
