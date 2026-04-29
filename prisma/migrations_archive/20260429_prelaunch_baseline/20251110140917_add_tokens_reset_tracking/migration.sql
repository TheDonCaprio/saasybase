-- Add tokensLastResetAt field to User table
ALTER TABLE "User" ADD COLUMN "tokensLastResetAt" DATETIME;
-- DropIndex
DROP INDEX "Team_ownerId_idx";

-- DropIndex
DROP INDEX "Team_planId_idx";

-- DropIndex
DROP INDEX "Team_clerkOrgId_key";

-- DropIndex
DROP INDEX "TeamMembership_teamId_userId_key";

-- DropIndex
DROP INDEX "TeamMembership_userId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Team";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TeamMembership";
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
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "imageUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "paymentsCount" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "tokensLastResetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "imageUrl", "name", "paymentsCount", "role", "stripeCustomerId", "tokenBalance", "updatedAt") SELECT "createdAt", "email", "id", "imageUrl", "name", "paymentsCount", "role", "stripeCustomerId", "tokenBalance", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE INDEX "users_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "users_payments_count_idx" ON "User"("paymentsCount");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
