(Normalize CANCELED -> CANCELLED)

This migration normalizes the legacy status spelling in the database from
`CANCELED` (legacy) to `CANCELLED` (canonical). It is safe and idempotent:

- It updates rows in `Subscription` and `Payment` where `status = 'CANCELED'`.
- It works for both Postgres (uses a small DO block) and SQLite (simple UPDATEs).

How to run

1. Backup your database before running (always).
2. From your project environment where Prisma is configured, run your usual
	 migration apply command (e.g., `prisma migrate deploy`) or execute the SQL
	 directly against the DB.

Notes

- This migration is intentionally idempotent — you can safely run it multiple
	times; it will only affect rows that still use the legacy spelling.
- After running in all target environments, you can remove any defensive code
	that tolerated both spellings.

