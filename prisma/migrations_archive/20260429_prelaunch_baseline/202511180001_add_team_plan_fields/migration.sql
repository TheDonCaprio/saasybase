-- Add organization-specific fields to Plan
ALTER TABLE "Plan" ADD COLUMN "supportsOrganizations" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Plan" ADD COLUMN "organizationSeatLimit" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "organizationTokenPoolStrategy" TEXT;
