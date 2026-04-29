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
    "ownerExemptFromCaps" BOOLEAN NOT NULL DEFAULT false,
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Organization_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Organization" ("billingEmail", "clerkOrganizationId", "createdAt", "id", "memberCapResetIntervalHours", "memberCapStrategy", "memberTokenCap", "name", "ownerUserId", "planId", "seatLimit", "slug", "tokenBalance", "tokenPoolStrategy", "updatedAt") SELECT "billingEmail", "clerkOrganizationId", "createdAt", "id", "memberCapResetIntervalHours", "memberCapStrategy", "memberTokenCap", "name", "ownerUserId", "planId", "seatLimit", "slug", "tokenBalance", "tokenPoolStrategy", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_clerkOrganizationId_key" ON "Organization"("clerkOrganizationId");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
