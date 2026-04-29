ALTER TABLE "User"
ADD COLUMN "suspendedAt" DATETIME;

ALTER TABLE "User"
ADD COLUMN "suspensionReason" TEXT;

ALTER TABLE "User"
ADD COLUMN "suspensionIsPermanent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Organization"
ADD COLUMN "suspendedAt" DATETIME;

ALTER TABLE "Organization"
ADD COLUMN "suspensionReason" TEXT;
