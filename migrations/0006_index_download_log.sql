-- Add index on download_log.requested_at for efficient prune queries
CREATE INDEX IF NOT EXISTS idx_download_log_requested_at ON download_log(requested_at);
