-- CreateTable
CREATE TABLE "PaymentAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "customerId" TEXT,
    "authorizationCode" TEXT NOT NULL,
    "reusable" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT,
    "brand" TEXT,
    "bank" TEXT,
    "last4" TEXT,
    "expMonth" TEXT,
    "expYear" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PaymentAuthorization_userId_provider_idx" ON "PaymentAuthorization"("userId", "provider");

-- CreateIndex
CREATE INDEX "PaymentAuthorization_provider_customerId_idx" ON "PaymentAuthorization"("provider", "customerId");

-- CreateIndex
CREATE INDEX "PaymentAuthorization_userId_provider_reusable_updatedAt_idx" ON "PaymentAuthorization"("userId", "provider", "reusable", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAuthorization_provider_authorizationCode_key" ON "PaymentAuthorization"("provider", "authorizationCode");
