Subscription denormalization migration notes

Goal
----
Support server-side ordering of subscriptions by the latest payment amount. To do this efficiently we add a denormalized nullable integer column `lastPaymentAmountCents` to the `Subscription` model and index it.

Why
---
Ordering subscriptions by a value on a related table (latest payment amount) requires a join or subquery which can be slow at scale and complex to express as a stable keyset cursor. Denormalizing the latest payment amount onto the subscription row makes ordering and keyset pagination straightforward and performant.

Prisma schema change
--------------------
The following field was added to `prisma/schema.prisma` under the `Subscription` model:

  lastPaymentAmountCents Int?
  @@index([lastPaymentAmountCents], name: "subscriptions_last_payment_amount_idx")

Local (dev) steps (SQLite)
--------------------------
1. Create and apply migration locally (will update `prisma/migrations/` and `dev.db`):

   npx prisma migrate dev --name add-subscription-last-payment-amount
   npx prisma generate

2. Backfill `lastPaymentAmountCents` from existing payments. Example SQLite SQL (adapt to your environment):

   -- For each subscription, find the latest payment (by createdAt) and set lastPaymentAmountCents
   UPDATE Subscription
   SET lastPaymentAmountCents = (
     SELECT amountCents FROM Payment WHERE Payment.subscriptionId = Subscription.id
     ORDER BY createdAt DESC LIMIT 1
   );

   -- Verify
   SELECT id, lastPaymentAmountCents FROM Subscription LIMIT 10;

Production/Postgres/MySQL guidance
----------------------------------
1. Create the migration locally (or generate SQL) but consider applying the index with `CONCURRENTLY` for Postgres to avoid table locks:

   -- Example Postgres SQL to backfill and create index concurrently
   BEGIN;
   -- Add the column (non-blocking)
   ALTER TABLE "Subscription" ADD COLUMN "lastPaymentAmountCents" INTEGER;
   -- Backfill in batches to avoid long-running transactions
   -- Example single-shot backfill (may be long):
   UPDATE "Subscription" s
   SET "lastPaymentAmountCents" = p.amountCents
   FROM (
     SELECT DISTINCT ON ("subscriptionId") "subscriptionId", amountCents
     FROM "Payment"
     WHERE "subscriptionId" IS NOT NULL
     ORDER BY "subscriptionId", "createdAt" DESC
   ) p
   WHERE p."subscriptionId" = s.id;
   COMMIT;

   -- Create index concurrently (no lock on writes)
   CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_last_payment_amount_idx ON "Subscription" ("lastPaymentAmountCents");

2. If you prefer, generate the migration via Prisma and then edit the generated SQL to use `CREATE INDEX CONCURRENTLY` before applying.

3. After backfill and index creation, run `npx prisma migrate deploy` and `npx prisma generate` on your deploy process.

Rollout notes
-------------
- The new column is nullable and does not affect existing reads until you update API code to use it for ordering.
- Backfill can be done offline in a maintenance window for very large tables. If you need continuous updates during backfill, consider maintaining `lastPaymentAmountCents` via application logic on payment creation/refund.

Follow-up
---------
I can:
- Scaffold and commit the Prisma migration files locally (`npx prisma migrate dev`) and include the SQL if you want to review and commit them.
- Add server code that updates `lastPaymentAmountCents` whenever payments are created/updated so the denormalized value stays current.

Which follow-ups should I do next?