-- Backfill provider-neutral columns/maps from legacy Stripe columns, then drop the legacy columns.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "imageUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "password" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerified" DATETIME,
    "paymentsCount" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_User" (
    "id",
    "email",
    "name",
    "imageUrl",
    "role",
    "password",
    "tokenVersion",
    "emailVerified",
    "paymentsCount",
    "externalCustomerIds",
    "tokenBalance",
    "freeTokenBalance",
    "freeTokensLastResetAt",
    "tokensLastResetAt",
    "createdAt",
    "updatedAt",
    "paymentProvider",
    "externalCustomerId"
)
SELECT
    "id",
    "email",
    "name",
    "imageUrl",
    "role",
    "password",
    "tokenVersion",
    "emailVerified",
    "paymentsCount",
    CASE
        WHEN "stripeCustomerId" IS NOT NULL THEN json_set(
            CASE
                WHEN "externalCustomerIds" IS NOT NULL AND json_valid("externalCustomerIds") THEN "externalCustomerIds"
                ELSE '{}'
            END,
            '$.stripe',
            "stripeCustomerId"
        )
        ELSE "externalCustomerIds"
    END,
    "tokenBalance",
    "freeTokenBalance",
    "freeTokensLastResetAt",
    "tokensLastResetAt",
    "createdAt",
    "updatedAt",
    "paymentProvider",
    COALESCE("externalCustomerId", "stripeCustomerId")
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_externalCustomerId_key" ON "User"("externalCustomerId");
CREATE INDEX "users_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "users_payments_count_idx" ON "User"("paymentsCount");
CREATE INDEX "User_externalCustomerId_idx" ON "User"("externalCustomerId");

CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
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
INSERT INTO "new_Plan" (
    "id",
    "name",
    "shortDescription",
    "description",
    "externalPriceId",
    "externalProductId",
    "externalPriceIds",
    "externalProductIds",
    "autoRenew",
    "recurringInterval",
    "recurringIntervalCount",
    "active",
    "durationHours",
    "priceCents",
    "sortOrder",
    "tokenLimit",
    "tokenName",
    "scope",
    "minSeats",
    "maxSeats",
    "seatPriceCents",
    "tokenPoolStrategy",
    "supportsOrganizations",
    "organizationSeatLimit",
    "organizationTokenPoolStrategy",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "name",
    "shortDescription",
    "description",
    COALESCE("externalPriceId", "stripePriceId"),
    "externalProductId",
    CASE
        WHEN "stripePriceId" IS NOT NULL THEN json_set(
            CASE
                WHEN "externalPriceIds" IS NOT NULL AND json_valid("externalPriceIds") THEN "externalPriceIds"
                ELSE '{}'
            END,
            '$.stripe',
            "stripePriceId"
        )
        ELSE "externalPriceIds"
    END,
    CASE
        WHEN "externalProductId" IS NOT NULL THEN json_set(
            CASE
                WHEN "externalProductIds" IS NOT NULL AND json_valid("externalProductIds") THEN "externalProductIds"
                ELSE '{}'
            END,
            '$.stripe',
            "externalProductId"
        )
        ELSE "externalProductIds"
    END,
    "autoRenew",
    "recurringInterval",
    "recurringIntervalCount",
    "active",
    "durationHours",
    "priceCents",
    "sortOrder",
    "tokenLimit",
    "tokenName",
    "scope",
    "minSeats",
    "maxSeats",
    "seatPriceCents",
    "tokenPoolStrategy",
    "supportsOrganizations",
    "organizationSeatLimit",
    "organizationTokenPoolStrategy",
    "createdAt",
    "updatedAt"
FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");
CREATE UNIQUE INDEX "Plan_externalPriceId_key" ON "Plan"("externalPriceId");

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
    "paymentProvider" TEXT,
    "externalSubscriptionId" TEXT,
    "externalSubscriptionIds" TEXT,
    "clearPaidTokensOnExpiry" BOOLEAN NOT NULL DEFAULT false,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "scheduledPlanId" TEXT,
    "scheduledPlanDate" DATETIME,
    "prorationPendingSince" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_scheduledPlanId_fkey" FOREIGN KEY ("scheduledPlanId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" (
    "id",
    "userId",
    "planId",
    "organizationId",
    "status",
    "startedAt",
    "expiresAt",
    "lastPaymentAmountCents",
    "canceledAt",
    "paymentProvider",
    "externalSubscriptionId",
    "externalSubscriptionIds",
    "clearPaidTokensOnExpiry",
    "cancelAtPeriodEnd",
    "scheduledPlanId",
    "scheduledPlanDate",
    "prorationPendingSince",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "userId",
    "planId",
    "organizationId",
    "status",
    "startedAt",
    "expiresAt",
    "lastPaymentAmountCents",
    "canceledAt",
    "paymentProvider",
    COALESCE("externalSubscriptionId", "stripeSubscriptionId"),
    CASE
        WHEN "stripeSubscriptionId" IS NOT NULL THEN json_set(
            CASE
                WHEN "externalSubscriptionIds" IS NOT NULL AND json_valid("externalSubscriptionIds") THEN "externalSubscriptionIds"
                ELSE '{}'
            END,
            '$.stripe',
            "stripeSubscriptionId"
        )
        ELSE "externalSubscriptionIds"
    END,
    "clearPaidTokensOnExpiry",
    "cancelAtPeriodEnd",
    "scheduledPlanId",
    "scheduledPlanDate",
    "prorationPendingSince",
    "createdAt",
    "updatedAt"
FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE UNIQUE INDEX "Subscription_externalSubscriptionId_key" ON "Subscription"("externalSubscriptionId");
CREATE INDEX "subscriptions_last_payment_amount_idx" ON "Subscription"("lastPaymentAmountCents");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_expiresAt_idx" ON "Subscription"("expiresAt");
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");
CREATE INDEX "Subscription_externalSubscriptionId_idx" ON "Subscription"("externalSubscriptionId");

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
INSERT INTO "new_Payment" (
    "id",
    "userId",
    "subscriptionId",
    "planId",
    "organizationId",
    "amountCents",
    "subtotalCents",
    "discountCents",
    "couponCode",
    "currency",
    "paymentProvider",
    "externalPaymentId",
    "externalSessionId",
    "externalRefundId",
    "externalPaymentIds",
    "externalSessionIds",
    "externalRefundIds",
    "status",
    "createdAt"
)
SELECT
    "id",
    "userId",
    "subscriptionId",
    "planId",
    "organizationId",
    "amountCents",
    "subtotalCents",
    "discountCents",
    "couponCode",
    "currency",
    "paymentProvider",
    COALESCE("externalPaymentId", "stripePaymentIntentId"),
    COALESCE("externalSessionId", "stripeCheckoutSessionId"),
    COALESCE("externalRefundId", "stripeRefundId"),
    CASE
        WHEN "stripePaymentIntentId" IS NOT NULL THEN json_set(
            CASE
                WHEN "externalPaymentIds" IS NOT NULL AND json_valid("externalPaymentIds") THEN "externalPaymentIds"
                ELSE '{}'
            END,
            '$.stripe',
            "stripePaymentIntentId"
        )
        ELSE "externalPaymentIds"
    END,
    CASE
        WHEN "stripeCheckoutSessionId" IS NOT NULL THEN json_set(
            CASE
                WHEN "externalSessionIds" IS NOT NULL AND json_valid("externalSessionIds") THEN "externalSessionIds"
                ELSE '{}'
            END,
            '$.stripe',
            "stripeCheckoutSessionId"
        )
        ELSE "externalSessionIds"
    END,
    CASE
        WHEN "stripeRefundId" IS NOT NULL THEN json_set(
            CASE
                WHEN "externalRefundIds" IS NOT NULL AND json_valid("externalRefundIds") THEN "externalRefundIds"
                ELSE '{}'
            END,
            '$.stripe',
            "stripeRefundId"
        )
        ELSE "externalRefundIds"
    END,
    "status",
    "createdAt"
FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_externalPaymentId_key" ON "Payment"("externalPaymentId");
CREATE UNIQUE INDEX "Payment_externalSessionId_key" ON "Payment"("externalSessionId");
CREATE UNIQUE INDEX "Payment_externalRefundId_key" ON "Payment"("externalRefundId");
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX "payments_createdAt_id_idx" ON "Payment"("createdAt", "id");
CREATE INDEX "payments_amount_idx" ON "Payment"("amountCents");
CREATE INDEX "Payment_organizationId_idx" ON "Payment"("organizationId");
CREATE INDEX "Payment_externalPaymentId_idx" ON "Payment"("externalPaymentId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
