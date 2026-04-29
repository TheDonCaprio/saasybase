/*
  Warnings:

  - A unique constraint covering the columns `[externalPaymentId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalSessionId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalRefundId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalPriceId]` on the table `Plan` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalSubscriptionId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalCustomerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "externalCouponId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "externalPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "externalRefundId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "externalSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paymentProvider" TEXT DEFAULT 'stripe';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "externalPriceId" TEXT;
ALTER TABLE "Plan" ADD COLUMN "externalProductId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "externalSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paymentProvider" TEXT DEFAULT 'stripe';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "externalCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "paymentProvider" TEXT DEFAULT 'stripe';

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalPaymentId_key" ON "Payment"("externalPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalSessionId_key" ON "Payment"("externalSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalRefundId_key" ON "Payment"("externalRefundId");

-- CreateIndex
CREATE INDEX "Payment_externalPaymentId_idx" ON "Payment"("externalPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_externalPriceId_key" ON "Plan"("externalPriceId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_externalSubscriptionId_key" ON "Subscription"("externalSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_externalSubscriptionId_idx" ON "Subscription"("externalSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalCustomerId_key" ON "User"("externalCustomerId");

-- CreateIndex
CREATE INDEX "User_externalCustomerId_idx" ON "User"("externalCustomerId");
