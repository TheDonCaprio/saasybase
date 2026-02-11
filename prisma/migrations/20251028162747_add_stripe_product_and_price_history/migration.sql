-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "stripeProductId" TEXT;

-- CreateTable
CREATE TABLE "PlanPriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "stripeProductId" TEXT,
    "unitAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "recurringInterval" TEXT,
    "createdBy" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanPriceHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlanPriceHistory_planId_idx" ON "PlanPriceHistory"("planId");

-- CreateIndex
CREATE INDEX "PlanPriceHistory_createdAt_idx" ON "PlanPriceHistory"("createdAt");
