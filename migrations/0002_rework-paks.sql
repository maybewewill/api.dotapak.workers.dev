DROP TABLE IF EXISTS paks;

CREATE TABLE IF NOT EXISTS paks (
  hash TEXT PRIMARY KEY,
  number INTEGER,
  filename TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  heroes TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at_db TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS download_log (
  ip_hash TEXT NOT NULL,
  pak_hash TEXT NOT NULL,
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (ip_hash, pak_hash)
);
