CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_slug ON tasks(slug);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
