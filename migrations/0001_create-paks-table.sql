CREATE TABLE IF NOT EXISTS paks (
  number INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  heroes TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at_db TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_paks_number ON paks(number);
