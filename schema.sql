-- D1 schema for the signup list.
--   npx wrangler d1 execute gmat-practice-signups --remote --file=./schema.sql
CREATE TABLE IF NOT EXISTS signups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  note       TEXT,
  country    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signups_created_at ON signups (created_at);
