/*
  Warnings:

  - You are about to drop the `PlanPriceHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `stripeProductId` on the `Plan` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PlanPriceHistory_createdAt_idx";

-- DropIndex
DROP INDEX "PlanPriceHistory_planId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanPriceHistory";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "stripePriceId" TEXT,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "recurringInterval" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "durationHours" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tokenLimit" INTEGER,
    "tokenName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Plan" ("active", "autoRenew", "createdAt", "description", "durationHours", "id", "name", "priceCents", "recurringInterval", "shortDescription", "sortOrder", "stripePriceId", "tokenLimit", "tokenName", "updatedAt") SELECT "active", "autoRenew", "createdAt", "description", "durationHours", "id", "name", "priceCents", "recurringInterval", "shortDescription", "sortOrder", "stripePriceId", "tokenLimit", "tokenName", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");
CREATE UNIQUE INDEX "Plan_stripePriceId_key" ON "Plan"("stripePriceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "payments_amount_idx" ON "Payment"("amountCents");
