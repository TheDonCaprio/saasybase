-- Idempotent migration: normalize legacy status spelling
-- Purpose: convert rows where status = 'CANCELED' to the canonical 'CANCELLED'
-- This script is safe to run multiple times. It only updates rows that still
-- have the legacy spelling and is written to work on common SQL dialects
-- (Postgres / SQLite). If you use another DB, adapt accordingly.

-- Normalize legacy status spelling to the canonical 'CANCELLED'.
-- Use simple UPDATE statements which are compatible with SQLite (dev) and Postgres.
UPDATE Subscription SET status = 'CANCELLED' WHERE status = 'CANCELED';
UPDATE Payment SET status = 'CANCELLED' WHERE status = 'CANCELED';

-- End of migration

