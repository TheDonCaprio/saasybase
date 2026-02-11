-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "recurringInterval" TEXT;

-- CreateIndex
CREATE INDEX "payments_createdAt_id_idx" ON "Payment"("createdAt", "id");

-- CreateIndex
CREATE INDEX "users_createdAt_id_idx" ON "User"("createdAt", "id");
