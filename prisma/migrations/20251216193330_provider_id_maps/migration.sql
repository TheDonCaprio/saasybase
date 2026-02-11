-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "externalPriceIds" TEXT;
ALTER TABLE "Plan" ADD COLUMN "externalProductIds" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "organizationId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER,
    "discountCents" INTEGER,
    "couponCode" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripePaymentIntentId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripeRefundId" TEXT,
    "paymentProvider" TEXT,
    "externalPaymentId" TEXT,
    "externalSessionId" TEXT,
    "externalRefundId" TEXT,
    "externalPaymentIds" TEXT,
    "externalSessionIds" TEXT,
    "externalRefundIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amountCents", "couponCode", "createdAt", "currency", "discountCents", "externalPaymentId", "externalRefundId", "externalSessionId", "id", "organizationId", "paymentProvider", "planId", "status", "stripeCheckoutSessionId", "stripePaymentIntentId", "stripeRefundId", "subscriptionId", "subtotalCents", "userId") SELECT "amountCents", "couponCode", "createdAt", "currency", "discountCents", "externalPaymentId", "externalRefundId", "externalSessionId", "id", "organizationId", "paymentProvider", "planId", "status", "stripeCheckoutSessionId", "stripePaymentIntentId", "stripeRefundId", "subscriptionId", "subtotalCents", "userId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "Payment_stripeRefundId_key" ON "Payment"("stripeRefundId");
CREATE UNIQUE INDEX "Payment_externalPaymentId_key" ON "Payment"("externalPaymentId");
CREATE UNIQUE INDEX "Payment_externalSessionId_key" ON "Payment"("externalSessionId");
CREATE UNIQUE INDEX "Payment_externalRefundId_key" ON "Payment"("externalRefundId");
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX "payments_createdAt_id_idx" ON "Payment"("createdAt", "id");
CREATE INDEX "payments_amount_idx" ON "Payment"("amountCents");
CREATE INDEX "Payment_organizationId_idx" ON "Payment"("organizationId");
CREATE INDEX "Payment_externalPaymentId_idx" ON "Payment"("externalPaymentId");
CREATE TABLE "new_Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "organizationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastPaymentAmountCents" INTEGER,
    "canceledAt" DATETIME,
    "stripeSubscriptionId" TEXT,
    "paymentProvider" TEXT,
    "externalSubscriptionId" TEXT,
    "externalSubscriptionIds" TEXT,
    "clearPaidTokensOnExpiry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("canceledAt", "clearPaidTokensOnExpiry", "createdAt", "expiresAt", "externalSubscriptionId", "id", "lastPaymentAmountCents", "organizationId", "paymentProvider", "planId", "startedAt", "status", "stripeSubscriptionId", "updatedAt", "userId") SELECT "canceledAt", "clearPaidTokensOnExpiry", "createdAt", "expiresAt", "externalSubscriptionId", "id", "lastPaymentAmountCents", "organizationId", "paymentProvider", "planId", "startedAt", "status", "stripeSubscriptionId", "updatedAt", "userId" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE UNIQUE INDEX "Subscription_externalSubscriptionId_key" ON "Subscription"("externalSubscriptionId");
CREATE INDEX "subscriptions_last_payment_amount_idx" ON "Subscription"("lastPaymentAmountCents");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_expiresAt_idx" ON "Subscription"("expiresAt");
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");
CREATE INDEX "Subscription_externalSubscriptionId_idx" ON "Subscription"("externalSubscriptionId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "imageUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "paymentsCount" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "externalCustomerIds" TEXT,
    "tokenBalance" INTEGER NOT NULL DEFAULT 0,
    "freeTokenBalance" INTEGER NOT NULL DEFAULT 0,
    "freeTokensLastResetAt" DATETIME,
    "tokensLastResetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "paymentProvider" TEXT,
    "externalCustomerId" TEXT
);
INSERT INTO "new_User" ("createdAt", "email", "externalCustomerId", "freeTokenBalance", "freeTokensLastResetAt", "id", "imageUrl", "name", "paymentProvider", "paymentsCount", "role", "stripeCustomerId", "tokenBalance", "tokensLastResetAt", "updatedAt") SELECT "createdAt", "email", "externalCustomerId", "freeTokenBalance", "freeTokensLastResetAt", "id", "imageUrl", "name", "paymentProvider", "paymentsCount", "role", "stripeCustomerId", "tokenBalance", "tokensLastResetAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_externalCustomerId_key" ON "User"("externalCustomerId");
CREATE INDEX "users_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "users_payments_count_idx" ON "User"("paymentsCount");
CREATE INDEX "User_externalCustomerId_idx" ON "User"("externalCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
