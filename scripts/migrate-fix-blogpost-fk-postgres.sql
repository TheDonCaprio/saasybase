-- PostgreSQL migration: Fix BlogPostCategory foreign key to reference SitePage(id)
-- Usage (run in a safe/staging environment first):
--   psql "<CONN_INFO>" -f pro-app/scripts/migrate-fix-blogpost-fk-postgres.sql

BEGIN;

-- Create new table with correct foreign keys
CREATE TABLE IF NOT EXISTS "BlogPostCategory_new" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- Add foreign key constraints pointing to "SitePage" and "BlogCategory"
ALTER TABLE "BlogPostCategory_new"
  ADD CONSTRAINT "blogpostcategory_postid_fkey" FOREIGN KEY ("postId") REFERENCES "SitePage" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogPostCategory_new"
  ADD CONSTRAINT "blogpostcategory_categoryid_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy only rows where both referenced records exist
INSERT INTO "BlogPostCategory_new" (id, "postId", "categoryId", "assignedAt")
SELECT id, "postId", "categoryId", "assignedAt" FROM "BlogPostCategory"
WHERE "postId" IN (SELECT id FROM "SitePage")
  AND "categoryId" IN (SELECT id FROM "BlogCategory");

-- Drop old table and replace with the new one
DROP TABLE IF EXISTS "BlogPostCategory";
ALTER TABLE "BlogPostCategory_new" RENAME TO "BlogPostCategory";

-- Recreate unique/indexes used by Prisma conventions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'blog_post_category_unique') THEN
    CREATE UNIQUE INDEX "blog_post_category_unique" ON "BlogPostCategory" ("postId", "categoryId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'blog_post_category_category_idx') THEN
    CREATE INDEX "blog_post_category_category_idx" ON "BlogPostCategory" ("categoryId");
  END IF;
END$$;

COMMIT;

-- Notes:
-- 1) Adjust quoted identifiers if your schema/table names differ (e.g., snake_case).
-- 2) Test on staging and verify referential integrity before running in production.
-- 3) Rollback by restoring a DB backup made prior to running this script.
