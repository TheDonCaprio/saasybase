Migration: Fix BlogPostCategory FK

Problem
- The existing SQLite schema had `BlogPostCategory.postId` referencing a table named `BlogPost`, but the application and Prisma schema use `SitePage` for posts. This mismatch causes foreign-key constraint violations when inserting join rows.

Goal
- Replace the FK on `BlogPostCategory` so `postId` references `SitePage(id)` permanently.

High-level steps (what the SQL script does)
1. Backup the DB file (`dev.db`).
2. Create a new table `BlogPostCategory_new` with the correct FK referencing `SitePage`.
3. Copy only rows where both the post and category exist into the new table.
4. Drop the old `BlogPostCategory` table and rename the new table to `BlogPostCategory`.
5. Recreate the unique constraint and index.

Files
- `pro-app/scripts/migrate-fix-blogpost-fk.sql` — the SQL migration to run against the SQLite DB.

How to run (dev/local)
1. Backup the DB:

```bash
cp pro-app/dev.db pro-app/dev.db.bak
```

2. Apply the migration:

```bash
sqlite3 pro-app/dev.db < pro-app/scripts/migrate-fix-blogpost-fk.sql
```

3. Verify (optional):

```bash
# Inspect FK definitions and table creation
node scripts/inspect-blogpostcategory-schema.js

# Re-run reproduce script to confirm FK error resolved
node scripts/reproduce-category-fk.js
```

Production notes
- Do NOT run this directly on production without a full database backup and a maintenance window.
- For production PostgreSQL or MySQL, this migration must be translated to the appropriate ALTER/CREATE/INSERT/DROP sequence. SQLite's limitations make it necessary to create a new table and copy data; other DB engines provide more direct ALTER capabilities.
- If you use Prisma Migrate in production, prefer generating a proper migration via Prisma so that migration history is tracked. You may need to adjust your Prisma schema or create a manual SQL migration that matches the target DB dialect.

Rollback
- If anything goes wrong, restore the backup:

```bash
cp pro-app/dev.db.bak pro-app/dev.db
```

Support
- I can run the backup + migration now and verify the app-level behavior if you want me to proceed.
