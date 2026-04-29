-- AlterTable
ALTER TABLE "Session" ADD COLUMN "lastActiveAt" DATETIME;
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Session" ADD COLUMN "country" TEXT;
ALTER TABLE "Session" ADD COLUMN "city" TEXT;

-- CreateIndex
CREATE INDEX "Session_userId_lastActiveAt_idx" ON "Session"("userId", "lastActiveAt");