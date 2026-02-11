-- Migration: remove legacy MAX_FREE_EXPORTS setting rows
-- This migration deletes any persisted setting rows with the key 'MAX_FREE_EXPORTS'.

DELETE FROM "Setting" WHERE key = 'MAX_FREE_EXPORTS';
