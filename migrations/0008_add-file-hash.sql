ALTER TABLE paks ADD COLUMN file_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_paks_file_hash ON paks(file_hash);
