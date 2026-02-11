-- MySQL (InnoDB) migration: Fix BlogPostCategory foreign key to reference SitePage(id)
-- Usage (run in a safe/staging environment first):
--   mysql -u <user> -p <database> < pro-app/scripts/migrate-fix-blogpost-fk-mysql.sql

SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS `BlogPostCategory_new` (
  `id` varchar(191) NOT NULL,
  `postId` varchar(191) NOT NULL,
  `categoryId` varchar(191) NOT NULL,
  `assignedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `BlogPostCategory_new`
  ADD CONSTRAINT `blogpostcategory_postid_fkey` FOREIGN KEY (`postId`) REFERENCES `SitePage` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `blogpostcategory_categoryid_fkey` FOREIGN KEY (`categoryId`) REFERENCES `BlogCategory` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy only rows where the referenced rows exist
INSERT INTO `BlogPostCategory_new` (id, postId, categoryId, assignedAt)
SELECT id, postId, categoryId, assignedAt FROM `BlogPostCategory`
WHERE postId IN (SELECT id FROM `SitePage`) AND categoryId IN (SELECT id FROM `BlogCategory`);

DROP TABLE IF EXISTS `BlogPostCategory`;
RENAME TABLE `BlogPostCategory_new` TO `BlogPostCategory`;

CREATE UNIQUE INDEX `blog_post_category_unique` ON `BlogPostCategory` (postId, categoryId);
CREATE INDEX `blog_post_category_category_idx` ON `BlogPostCategory` (categoryId);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;

-- Notes:
-- 1) Adjust quoted identifiers if your schema/table names differ.
-- 2) For large tables, consider batching the INSERT to avoid long locks.
-- 3) Restore from backup if needed to rollback.
