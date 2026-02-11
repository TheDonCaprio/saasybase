-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "externalPriceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER,
    "amountOffCents" INTEGER,
    "currency" TEXT,
    "duration" TEXT NOT NULL DEFAULT 'once',
    "durationInMonths" INTEGER,
    "minimumPurchaseCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "stripeCouponId" TEXT,
    "stripePromotionCodeId" TEXT,
    "externalCouponId" TEXT,
    "externalPromotionCodeId" TEXT
);
INSERT INTO "new_Coupon" ("active", "amountOffCents", "code", "createdAt", "description", "endsAt", "externalCouponId", "externalPromotionCodeId", "id", "maxRedemptions", "percentOff", "redemptionCount", "startsAt", "stripeCouponId", "stripePromotionCodeId", "updatedAt") SELECT "active", "amountOffCents", "code", "createdAt", "description", "endsAt", "externalCouponId", "externalPromotionCodeId", "id", "maxRedemptions", "percentOff", "redemptionCount", "startsAt", "stripeCouponId", "stripePromotionCodeId", "updatedAt" FROM "Coupon";
DROP TABLE "Coupon";
ALTER TABLE "new_Coupon" RENAME TO "Coupon";
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
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
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("canceledAt", "clearPaidTokensOnExpiry", "createdAt", "expiresAt", "externalSubscriptionId", "externalSubscriptionIds", "id", "lastPaymentAmountCents", "organizationId", "paymentProvider", "planId", "startedAt", "status", "stripeSubscriptionId", "updatedAt", "userId") SELECT "canceledAt", "clearPaidTokensOnExpiry", "createdAt", "expiresAt", "externalSubscriptionId", "externalSubscriptionIds", "id", "lastPaymentAmountCents", "organizationId", "paymentProvider", "planId", "startedAt", "status", "stripeSubscriptionId", "updatedAt", "userId" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE UNIQUE INDEX "Subscription_externalSubscriptionId_key" ON "Subscription"("externalSubscriptionId");
CREATE INDEX "subscriptions_last_payment_amount_idx" ON "Subscription"("lastPaymentAmountCents");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_expiresAt_idx" ON "Subscription"("expiresAt");
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");
CREATE INDEX "Subscription_externalSubscriptionId_idx" ON "Subscription"("externalSubscriptionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlanPrice_planId_idx" ON "PlanPrice"("planId");

-- CreateIndex
CREATE INDEX "PlanPrice_provider_currency_idx" ON "PlanPrice"("provider", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_planId_provider_currency_key" ON "PlanPrice"("planId", "provider", "currency");
