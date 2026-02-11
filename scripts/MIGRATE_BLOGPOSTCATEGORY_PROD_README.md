Production Migration: Fix BlogPostCategory FK

Overview
- These scripts help permanently align the foreign-key relationship so that `BlogPostCategory.postId` references `SitePage(id)` instead of an out-of-date `BlogPost` table.

Files
- `pro-app/scripts/migrate-fix-blogpost-fk-postgres.sql` — PostgreSQL migration script.
- `pro-app/scripts/migrate-fix-blogpost-fk-mysql.sql` — MySQL migration script.

Important safety notes
- Always back up production data before running any migration. Do not run these scripts directly on production without a tested staging run and a rollback plan.
- Table and column names may differ in your production schema (e.g., snake_case); update the scripts accordingly before running.
- If your schema is managed by Prisma Migrate, prefer generating a proper Prisma migration so changes are tracked.

When you do NOT need these scripts
- If your production environment is brand-new (no existing tables created yet), and you will create the schema from the current Prisma schema, you do NOT need these corrective scripts. A fresh migration run (e.g. `prisma migrate deploy`) will create the correct tables and FKs according to the Prisma schema.

Recommended workflows
- New deployment / fresh DB:
  1. Ensure Prisma schema matches intended models (confirm `SitePage`, `BlogCategory`, `BlogPostCategory` models).
  2. Run Prisma migrations (generate + apply) to create the schema.
  -> No corrective SQL required.

- Existing DB with mismatch (common case):
  1. Take a full backup of the DB.
  2. Run the appropriate script below in a staging environment and validate behavior.
  3. Run the same script in production during a maintenance window.
  4. Verify application behavior and re-run tests.

Rollback
- The safest rollback is to restore the database from the backup taken before migration.

Prisma notes
- If you want to keep Prisma in sync, after applying a manual SQL migration, consider using `prisma db pull` to update Prisma's understanding of the DB and then generate a no-op migration (or adjust migration history) so your migration history remains consistent.

If you want, I can:
- Translate these into a Prisma migration and show the exact `prisma migrate` steps for staging and production.
- Generate a rollback SQL file for your production dialect.
