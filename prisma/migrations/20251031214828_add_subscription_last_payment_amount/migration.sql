-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastPaymentAmountCents" INTEGER;

-- CreateIndex
CREATE INDEX "subscriptions_last_payment_amount_idx" ON "User"("lastPaymentAmountCents");
