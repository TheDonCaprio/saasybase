-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "couponCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "discountCents" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "subtotalCents" INTEGER;
