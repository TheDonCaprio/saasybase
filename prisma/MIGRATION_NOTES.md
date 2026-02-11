Migration notes: add index on amountCents for Payment

Why
----
We added server-side sorting by `amount` (backed by the `amountCents` column). To ensure queries that ORDER BY `amountCents` (and keyset cursor comparisons on that column) perform well on large tables, add a database index on `amountCents`.

Prisma schema change
--------------------
The `Payment` model in `prisma/schema.prisma` now includes:

  @@index([amountCents], name: "payments_amount_idx")

This file has already been updated in the repository.

Developer / Local (SQLite) steps
-------------------------------
1. Install Prisma CLI (if not already):

   npm install --save-dev prisma @prisma/client

2. Generate the client and create a migration locally (SQLite dev DB):

   npx prisma migrate dev --name add-payment-amount-index
   npx prisma generate

This will update `prisma/migrations/` with a migration file and apply it to the local `dev.db`.

Production/Postgres/MySQL guidance
----------------------------------
- If you use Postgres or MySQL in production, prefer creating a migration and reviewing the generated SQL before applying it.

1. Create the migration (on a machine with access to the development DB and Prisma configured):

   npx prisma migrate dev --name add-payment-amount-index

2. Inspect the generated SQL under `prisma/migrations/<timestamp>_add-payment-amount-index/`
   to confirm the SQL is safe. For example, Postgres will produce:

   CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_amount_idx" ON "Payment" ("amountCents");

   Note: Prisma's default migration mechanism does not always use CONCURRENTLY; for very large tables you may want to apply the index manually with CONCURRENTLY to avoid locking the table.

3. To avoid table locks on Postgres with large tables, consider running the SQL manually using `CREATE INDEX CONCURRENTLY` during a maintenance window:

   -- example (Postgres):
   CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_amount_idx ON payments (amount_cents);

   Adjust identifiers to match your production schema casing and naming conventions.

4. Once the index is applied in production, run:

   npx prisma migrate deploy
   npx prisma generate

Notes & Caveats
---------------
- If `amountCents` can be NULL in your production schema, the index will include NULL values. Decide whether you want to coalesce NULL to 0 for ordering semantics and implement in queries if needed.
- If you prefer to create the index manually in production (recommended for very large tables), create the migration in the repo for version control, but apply the SQL manually using `CREATE INDEX CONCURRENTLY`.
- After applying the migration, monitor query performance and remove any redundant full-table scans.

Follow-up
--------
If you'd like, I can:
- Scaffold the Prisma migration (run `npx prisma migrate dev`) locally and commit the generated migration files to `prisma/migrations/` for you to review.
- Add a brief PR description that explains the impact and rollout steps for ops.

Which would you prefer?