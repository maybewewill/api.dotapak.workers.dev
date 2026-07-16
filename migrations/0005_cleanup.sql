-- Drop the unused tasks table (from the starter template)
DROP TABLE IF EXISTS tasks;

-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_paks_created_at_db ON paks(created_at_db DESC);

-- Expression indexes for JSON filter queries
CREATE INDEX IF NOT EXISTS idx_paks_creator ON paks(json_extract(data, '$.data.creator'));
CREATE INDEX IF NOT EXISTS idx_paks_creator_url ON paks(json_extract(data, '$.data.creator_url'));
