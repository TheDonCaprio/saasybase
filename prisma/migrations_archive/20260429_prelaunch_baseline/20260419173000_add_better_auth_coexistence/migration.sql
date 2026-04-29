PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

ALTER TABLE "User"
ADD COLUMN "emailVerifiedBool" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Organization"
ADD COLUMN "logo" TEXT;

ALTER TABLE "Organization"
ADD COLUMN "metadata" TEXT;

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
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Account" (
  "id",
  "userId",
  "type",
  "provider",
  "providerAccountId",
  "accountId",
  "providerId",
  "refresh_token",
  "access_token",
  "refreshToken",
  "accessToken",
  "expires_at",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "token_type",
  "scope",
  "id_token",
  "idToken",
  "session_state",
  "password",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "userId",
  "type",
  "provider",
  "providerAccountId",
  NULL,
  NULL,
  "refresh_token",
  "access_token",
  NULL,
  NULL,
  "expires_at",
  NULL,
  NULL,
  "token_type",
  "scope",
  "id_token",
  NULL,
  "session_state",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Account";

DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Account_providerId_accountId_idx" ON "Account"("providerId", "accountId");

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
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activeOrganizationId" TEXT,
  "activeTeamId" TEXT,
  CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Session" (
  "id",
  "sessionToken",
  "token",
  "userId",
  "expires",
  "expiresAt",
  "lastActiveAt",
  "ipAddress",
  "userAgent",
  "country",
  "city",
  "createdAt",
  "updatedAt",
  "activeOrganizationId",
  "activeTeamId"
)
SELECT
  "id",
  "sessionToken",
  NULL,
  "userId",
  "expires",
  NULL,
  "lastActiveAt",
  "ipAddress",
  "userAgent",
  "country",
  "city",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL,
  NULL
FROM "Session";

DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_token_idx" ON "Session"("token");
CREATE INDEX "Session_userId_lastActiveAt_idx" ON "Session"("userId", "lastActiveAt");

CREATE TABLE "Verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Verification_value_key" ON "Verification"("value");
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");

COMMIT;

PRAGMA foreign_keys=ON;