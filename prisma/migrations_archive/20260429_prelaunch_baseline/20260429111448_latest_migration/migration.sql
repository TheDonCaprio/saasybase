-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accountId" TEXT,
    "providerId" TEXT,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "expires_at" INTEGER,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "idToken" TEXT,
    "session_state" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("accessToken", "accessTokenExpiresAt", "access_token", "accountId", "createdAt", "expires_at", "id", "idToken", "id_token", "password", "provider", "providerAccountId", "providerId", "refreshToken", "refreshTokenExpiresAt", "refresh_token", "scope", "session_state", "token_type", "type", "updatedAt", "userId") SELECT "accessToken", "accessTokenExpiresAt", "access_token", "accountId", "createdAt", "expires_at", "id", "idToken", "id_token", "password", "provider", "providerAccountId", "providerId", "refreshToken", "refreshTokenExpiresAt", "refresh_token", "scope", "session_state", "token_type", "type", "updatedAt", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Account_providerId_accountId_idx" ON "Account"("providerId", "accountId");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "token" TEXT,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "lastActiveAt" DATETIME,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "activeOrganizationId" TEXT,
    "activeTeamId" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("activeOrganizationId", "activeTeamId", "city", "country", "createdAt", "expires", "expiresAt", "id", "ipAddress", "lastActiveAt", "sessionToken", "token", "updatedAt", "userAgent", "userId") SELECT "activeOrganizationId", "activeTeamId", "city", "country", "createdAt", "expires", "expiresAt", "id", "ipAddress", "lastActiveAt", "sessionToken", "token", "updatedAt", "userAgent", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_token_idx" ON "Session"("token");
CREATE INDEX "Session_userId_lastActiveAt_idx" ON "Session"("userId", "lastActiveAt");
CREATE TABLE "new_Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Verification" ("createdAt", "expiresAt", "id", "identifier", "updatedAt", "value") SELECT "createdAt", "expiresAt", "id", "identifier", "updatedAt", "value" FROM "Verification";
DROP TABLE "Verification";
ALTER TABLE "new_Verification" RENAME TO "Verification";
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
CREATE INDEX "Verification_value_idx" ON "Verification"("value");
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineIndex
DROP INDEX "Organization_clerkOrganizationId_key";
CREATE UNIQUE INDEX "Organization_providerOrganizationId_key" ON "Organization"("providerOrganizationId");
