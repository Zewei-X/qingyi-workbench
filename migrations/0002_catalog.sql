CREATE TABLE IF NOT EXISTS catalog_state (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'feishu'
);
