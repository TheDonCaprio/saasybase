-- Backfill: ensure existing team plans keep organization capabilities after schema change
-- Any plan scoped as TEAM should explicitly set supportsOrganizations = true
UPDATE "Plan"
SET "supportsOrganizations" = 1
WHERE "scope" = 'TEAM'
  AND "supportsOrganizations" IS NOT 1;

-- Ensure the shared token pool strategy is present for TEAM plans
UPDATE "Plan"
SET "organizationTokenPoolStrategy" = 'SHARED_FOR_ORG'
WHERE "scope" = 'TEAM'
  AND ("organizationTokenPoolStrategy" IS NULL OR trim("organizationTokenPoolStrategy") = '');
