-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerkOrganizationId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "planId" TEXT,
    "billingEmail" TEXT,
    "seatLimit" INTEGER,
    "tokenPoolStrategy" TEXT NOT NULL DEFAULT 'SHARED_FOR_ORG',
    "memberTokenCap" INTEGER,
    "memberCapStrategy" TEXT NOT NULL DEFAULT 'SOFT',
    "memberCapResetIntervalHours" INTEGER,
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Organization_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Organization" ("billingEmail", "clerkOrganizationId", "createdAt", "id", "name", "ownerUserId", "planId", "seatLimit", "slug", "tokenBalance", "tokenPoolStrategy", "updatedAt") SELECT "billingEmail", "clerkOrganizationId", "createdAt", "id", "name", "ownerUserId", "planId", "seatLimit", "slug", "tokenBalance", "tokenPoolStrategy", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_clerkOrganizationId_key" ON "Organization"("clerkOrganizationId");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");
CREATE TABLE "new_OrganizationMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sharedTokenBalance" INTEGER NOT NULL DEFAULT 0,
    "memberTokenCapOverride" INTEGER,
    "memberTokenUsageWindowStart" DATETIME,
    "memberTokenUsage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrganizationMembership" ("createdAt", "id", "organizationId", "role", "status", "updatedAt", "userId") SELECT "createdAt", "id", "organizationId", "role", "status", "updatedAt", "userId" FROM "OrganizationMembership";
DROP TABLE "OrganizationMembership";
ALTER TABLE "new_OrganizationMembership" RENAME TO "OrganizationMembership";
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");
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
INSERT INTO "new_Plan" ("active", "autoRenew", "createdAt", "description", "durationHours", "id", "maxSeats", "minSeats", "name", "organizationSeatLimit", "organizationTokenPoolStrategy", "priceCents", "recurringInterval", "scope", "seatPriceCents", "shortDescription", "sortOrder", "stripePriceId", "supportsOrganizations", "tokenLimit", "tokenName", "tokenPoolStrategy", "updatedAt") SELECT "active", "autoRenew", "createdAt", "description", "durationHours", "id", "maxSeats", "minSeats", "name", "organizationSeatLimit", "organizationTokenPoolStrategy", "priceCents", "recurringInterval", "scope", "seatPriceCents", "shortDescription", "sortOrder", "stripePriceId", "supportsOrganizations", "tokenLimit", "tokenName", "tokenPoolStrategy", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");
CREATE UNIQUE INDEX "Plan_stripePriceId_key" ON "Plan"("stripePriceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
