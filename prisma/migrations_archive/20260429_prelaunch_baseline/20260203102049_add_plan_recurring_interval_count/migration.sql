-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "stripePriceId" TEXT,
    "externalPriceId" TEXT,
    "externalProductId" TEXT,
    "externalPriceIds" TEXT,
    "externalProductIds" TEXT,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "recurringInterval" TEXT,
    "recurringIntervalCount" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "durationHours" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tokenLimit" INTEGER,
    "tokenName" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "minSeats" INTEGER NOT NULL DEFAULT 1,
    "maxSeats" INTEGER,
    "seatPriceCents" INTEGER,
    "tokenPoolStrategy" TEXT,
    "supportsOrganizations" BOOLEAN NOT NULL DEFAULT false,
    "organizationSeatLimit" INTEGER,
    "organizationTokenPoolStrategy" TEXT DEFAULT 'SHARED_FOR_ORG',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Plan" ("active", "autoRenew", "createdAt", "description", "durationHours", "externalPriceId", "externalPriceIds", "externalProductId", "externalProductIds", "id", "maxSeats", "minSeats", "name", "organizationSeatLimit", "organizationTokenPoolStrategy", "priceCents", "recurringInterval", "scope", "seatPriceCents", "shortDescription", "sortOrder", "stripePriceId", "supportsOrganizations", "tokenLimit", "tokenName", "tokenPoolStrategy", "updatedAt") SELECT "active", "autoRenew", "createdAt", "description", "durationHours", "externalPriceId", "externalPriceIds", "externalProductId", "externalProductIds", "id", "maxSeats", "minSeats", "name", "organizationSeatLimit", "organizationTokenPoolStrategy", "priceCents", "recurringInterval", "scope", "seatPriceCents", "shortDescription", "sortOrder", "stripePriceId", "supportsOrganizations", "tokenLimit", "tokenName", "tokenPoolStrategy", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");
CREATE UNIQUE INDEX "Plan_stripePriceId_key" ON "Plan"("stripePriceId");
CREATE UNIQUE INDEX "Plan_externalPriceId_key" ON "Plan"("externalPriceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
