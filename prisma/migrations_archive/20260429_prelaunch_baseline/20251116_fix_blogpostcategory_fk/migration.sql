-- Prisma-style migration: Fix BlogPostCategory FK to reference SitePage(id)
-- Intended for SQLite datasource (matches project's `prisma/schema.prisma` provider)
-- Apply with: `sqlite3 prisma/dev.db < prisma/migrations/20251116_fix_blogpostcategory_fk/migration.sql`

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "BlogPostCategory_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add FK constraints referencing SitePage and BlogCategory
PRAGMA foreign_keys = OFF;
-- SQLite requires the FK clauses in CREATE TABLE; we will recreate the table with constraints in the final replace step
-- Copy only rows where referenced records exist to avoid violating new FK
INSERT INTO "BlogPostCategory_new" (id, postId, categoryId, assignedAt)
SELECT id, postId, categoryId, assignedAt FROM "BlogPostCategory"
WHERE postId IN (SELECT id FROM "SitePage")
  AND categoryId IN (SELECT id FROM "BlogCategory");

DROP TABLE IF EXISTS "BlogPostCategory";

CREATE TABLE "BlogPostCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogPostCategory_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SitePage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BlogPostCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "BlogPostCategory" (id, postId, categoryId, assignedAt)
SELECT id, postId, categoryId, assignedAt FROM "BlogPostCategory_new";

DROP TABLE IF EXISTS "BlogPostCategory_new";

CREATE UNIQUE INDEX IF NOT EXISTS "blog_post_category_unique" ON "BlogPostCategory" (postId, categoryId);
CREATE INDEX IF NOT EXISTS "blog_post_category_category_idx" ON "BlogPostCategory" (categoryId);

PRAGMA foreign_keys = ON;

COMMIT;

-- End migration
