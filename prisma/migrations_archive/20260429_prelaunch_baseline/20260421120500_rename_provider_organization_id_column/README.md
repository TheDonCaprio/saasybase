Prisma migration: rename_provider_organization_id_column

This folder contains a manual SQLite migration to physically rename the
`Organization.clerkOrganizationId` column to `Organization.providerOrganizationId`.

Why manual:
- The local development database has unrelated drift, so `prisma migrate dev`
  will not generate/apply this change without forcing a reset.
- The application code and Prisma schema already use `providerOrganizationId`.

How to apply (dev/local):

1. Backup your DB:

```bash
cp prisma/dev2.db prisma/dev2.db.bak
```

2. Run the migration SQL:

```bash
npx prisma db execute --config prisma.config.ts --file prisma/migrations/20260421120500_rename_provider_organization_id_column/migration.sql
```

3. Regenerate Prisma Client:

```bash
npx prisma generate
```

Notes:
- This SQL is intended for SQLite local/dev databases.
- Do not re-run it after the column has already been renamed.