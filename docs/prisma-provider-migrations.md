# Prisma Provider And Migration Guide

This repo now ships with a committed **PostgreSQL** Prisma migration baseline.

That means two separate things matter during setup:

- `DATABASE_URL` decides which database instance Prisma connects to.
- `prisma/schema.prisma` plus `prisma/migrations/` decide which **database provider** that migration history belongs to.

Those are not interchangeable.

## Why `DATABASE_PROVIDER` is not the fix

Prisma 7 does not allow `provider = env("DATABASE_PROVIDER")` in a datasource block.

Even if it did, a single Prisma migration history still would not become portable across SQLite and PostgreSQL. The generated SQL and `migration_lock.toml` are provider-specific, so a SQLite migration chain cannot be replayed as PostgreSQL just by changing an env var.

## Repo default

- `prisma/schema.prisma` uses `provider = "postgresql"`
- `prisma/migrations/migration_lock.toml` uses `provider = "postgresql"`
- `prisma/migrations/20260429170000_prelaunch_baseline/migration.sql` is a PostgreSQL baseline generated from the current schema

Use PostgreSQL for any workflow that depends on committed migrations or `npm run prisma:deploy`.

## Fresh install

For a normal fresh setup:

```bash
npm install
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"
npm run prisma:diagnose-provider
npm run prisma:deploy
npx prisma db seed
```

If the target PostgreSQL database is empty, `npm run prisma:deploy` is the right command.

## Moving from old SQLite development to PostgreSQL production

The important rule is simple:

- do not carry old SQLite Prisma migrations into PostgreSQL
- do not point production Prisma commands at an old local SQLite file
- do not expect Prisma Migrate to translate SQLite history into PostgreSQL history automatically

The safest path is:

1. Provision a fresh PostgreSQL database.
2. Point `DATABASE_URL` at that PostgreSQL database.
3. Run `npm run prisma:diagnose-provider` and confirm both the resolved database and schema provider are PostgreSQL.
4. Run `npm run prisma:deploy`.
5. Seed or import data separately.

If you need data from an old SQLite database, move the data with an explicit export/import or one-off script. Treat schema migration and data migration as separate steps.

## Recovering from `P3019`

`P3019` means the provider declared in `prisma/schema.prisma` does not match the provider recorded in `prisma/migrations/migration_lock.toml`.

In this repo, that used to happen when older SQLite migration state was mixed with the newer PostgreSQL schema/provider lane.

Use the recovery path that matches your case:

### Case 1: fresh or disposable database

If the target database is empty or disposable:

```bash
npm run prisma:diagnose-provider
npm run prisma:deploy
```

If you accidentally targeted the wrong local database, fix `DATABASE_URL` first.

### Case 2: existing PostgreSQL database already matches the baseline

If you already have a PostgreSQL database whose schema matches the current baseline and you only need Prisma to mark the migration as applied:

```bash
npx prisma migrate resolve \
  --applied 20260429170000_prelaunch_baseline \
  --config prisma.config.ts
```

Only do this when you are sure the database schema already matches the committed baseline.

### Case 3: stale local state is getting in the way

If the repo should be pointing at a fresh database but Prisma is still seeing old migration state:

1. Run `npm run prisma:diagnose-provider`.
2. Check `.env.local`, `.env.development`, `.env`, and any enabled secrets provider.
3. Make sure `DATABASE_URL` is not being overridden to an old SQLite file or an older PostgreSQL database.
4. For disposable local databases only, use `npm run prisma:reset` after confirming the target is safe to wipe.

## If you still want SQLite locally

SQLite can still be useful as a throwaway local prototyping lane, but it is a separate lane.

If you want that lane, maintain it explicitly with a separate schema/migration setup and do not commit those SQLite migrations into the shared PostgreSQL migration history.

For the shared repo path, default to PostgreSQL from day one.