-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SitePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
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
INSERT INTO "new_SitePage" ("content", "createdAt", "description", "id", "published", "publishedAt", "slug", "system", "title", "updatedAt") SELECT "content", "createdAt", "description", "id", "published", "publishedAt", "slug", "system", "title", "updatedAt" FROM "SitePage";
DROP TABLE "SitePage";
ALTER TABLE "new_SitePage" RENAME TO "SitePage";
CREATE UNIQUE INDEX "SitePage_slug_key" ON "SitePage"("slug");
CREATE INDEX "SitePage_published_slug_idx" ON "SitePage"("published", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
