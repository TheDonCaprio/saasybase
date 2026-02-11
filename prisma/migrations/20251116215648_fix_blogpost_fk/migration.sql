/*
  Warnings:

  - You are about to drop the `BlogPost` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `updatedAt` on table `BlogCategory` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "BlogPost_published_slug_idx";

-- DropIndex
DROP INDEX "BlogPost_slug_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BlogPost";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BlogCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BlogCategory" ("createdAt", "description", "id", "slug", "title", "updatedAt") SELECT coalesce("createdAt", CURRENT_TIMESTAMP) AS "createdAt", "description", "id", "slug", "title", "updatedAt" FROM "BlogCategory";
DROP TABLE "BlogCategory";
ALTER TABLE "new_BlogCategory" RENAME TO "BlogCategory";
CREATE UNIQUE INDEX "BlogCategory_slug_key" ON "BlogCategory"("slug");
CREATE TABLE "new_BlogPostCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlogPostCategory_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SitePage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BlogPostCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BlogPostCategory" ("assignedAt", "categoryId", "id", "postId") SELECT coalesce("assignedAt", CURRENT_TIMESTAMP) AS "assignedAt", "categoryId", "id", "postId" FROM "BlogPostCategory";
DROP TABLE "BlogPostCategory";
ALTER TABLE "new_BlogPostCategory" RENAME TO "BlogPostCategory";
CREATE INDEX "blog_post_category_category_idx" ON "BlogPostCategory"("categoryId");
CREATE UNIQUE INDEX "BlogPostCategory_postId_categoryId_key" ON "BlogPostCategory"("postId", "categoryId");
CREATE TABLE "new_SitePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collection" TEXT NOT NULL DEFAULT 'page',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "trashedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImage" TEXT
);
INSERT INTO "new_SitePage" ("canonicalUrl", "collection", "content", "createdAt", "description", "id", "metaDescription", "metaTitle", "noIndex", "ogDescription", "ogImage", "ogTitle", "published", "publishedAt", "slug", "system", "title", "trashedAt", "updatedAt") SELECT "canonicalUrl", coalesce("collection", 'page') AS "collection", "content", "createdAt", "description", "id", "metaDescription", "metaTitle", "noIndex", "ogDescription", "ogImage", "ogTitle", "published", "publishedAt", "slug", "system", "title", "trashedAt", "updatedAt" FROM "SitePage";
DROP TABLE "SitePage";
ALTER TABLE "new_SitePage" RENAME TO "SitePage";
CREATE INDEX "sitepage_collection_slug_idx" ON "SitePage"("collection", "slug");
CREATE INDEX "sitepage_published_slug_idx" ON "SitePage"("published", "slug");
CREATE UNIQUE INDEX "sitepage_collection_slug_unique" ON "SitePage"("collection", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
