DROP TABLE IF EXISTS paks;

CREATE TABLE IF NOT EXISTS paks (
  hash TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at_db TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
