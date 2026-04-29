-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "imageUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "paymentsCount" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "freeTokenBalance" INTEGER NOT NULL DEFAULT 0,
    "freeTokensLastResetAt" DATETIME,
    "tokensLastResetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "imageUrl", "name", "paymentsCount", "role", "stripeCustomerId", "tokenBalance", "tokensLastResetAt", "updatedAt") SELECT "createdAt", "email", "id", "imageUrl", "name", "paymentsCount", "role", "stripeCustomerId", "tokenBalance", "tokensLastResetAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE INDEX "users_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "users_payments_count_idx" ON "User"("paymentsCount");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
