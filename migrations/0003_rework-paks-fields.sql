DROP TABLE IF EXISTS paks;

CREATE TABLE IF NOT EXISTS paks (
  hash TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  creator TEXT NOT NULL DEFAULT '',
  creator_url TEXT NOT NULL DEFAULT '',
  added_at INTEGER NOT NULL,
  heroes TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at_db TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
