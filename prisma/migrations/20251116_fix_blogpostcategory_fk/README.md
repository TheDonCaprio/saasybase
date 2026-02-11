Prisma migration: fix_blogpostcategory_fk

This folder contains a manual migration intended for SQLite datasource to fix the
foreign-key on `BlogPostCategory.postId` so it references `SitePage(id)`.

How to apply (dev/local):

1. Backup your DB:

```bash
cp prisma/dev.db prisma/dev.db.bak
```

2. Run the migration SQL:

```bash
sqlite3 prisma/dev.db < prisma/migrations/20251116_fix_blogpostcategory_fk/migration.sql
```

3. Verify with the project's inspection and reproduce scripts.

Notes:
- If you manage migrations with `prisma migrate`, prefer generating a migration via
  `npx prisma migrate dev --name fix-blogpost-fk` and reviewing the generated SQL.
- This manual migration is safe for dev/staging and is idempotent when re-run, but
  always verify backups before applying in production.
