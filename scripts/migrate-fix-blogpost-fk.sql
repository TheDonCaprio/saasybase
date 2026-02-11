-- Migration: Fix BlogPostCategory foreign key to reference SitePage.id instead of BlogPost.id
-- Usage: BACKUP your DB, then run:
--   sqlite3 pro-app/dev.db < pro-app/scripts/migrate-fix-blogpost-fk.sql

BEGIN TRANSACTION;

-- Create a new table with the correct FK to SitePage
CREATE TABLE IF NOT EXISTS "BlogPostCategory_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogPostCategory_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SitePage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BlogPostCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy only rows where referenced SitePage and BlogCategory exist
INSERT INTO "BlogPostCategory_new" (id, postId, categoryId, assignedAt)
SELECT id, postId, categoryId, assignedAt FROM "BlogPostCategory"
WHERE postId IN (SELECT id FROM "SitePage")
  AND categoryId IN (SELECT id FROM "BlogCategory");

-- Drop the old table
DROP TABLE IF EXISTS "BlogPostCategory";

-- Rename new table to the original name
ALTER TABLE "BlogPostCategory_new" RENAME TO "BlogPostCategory";

-- Recreate unique constraint and index (names chosen to match Prisma conventions)
CREATE UNIQUE INDEX IF NOT EXISTS "blog_post_category_unique" ON "BlogPostCategory" (postId, categoryId);
CREATE INDEX IF NOT EXISTS "blog_post_category_category_idx" ON "BlogPostCategory" (categoryId);

COMMIT;

-- End of migration
