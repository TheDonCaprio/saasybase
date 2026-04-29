-- Migration: Sync local DB schema to Prisma schema
-- Adds missing columns and renames legacy columns so local dev DB matches Prisma schema.

BEGIN TRANSACTION;

-- Add missing collection column to SitePage (if not present)
ALTER TABLE SitePage ADD COLUMN collection TEXT DEFAULT 'page';

-- Rename BlogCategory.name -> BlogCategory.title
ALTER TABLE BlogCategory RENAME COLUMN name TO title;

-- Add timestamps to BlogCategory
ALTER TABLE BlogCategory ADD COLUMN createdAt DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE BlogCategory ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Rename BlogPostCategory.blogPostId -> postId
ALTER TABLE BlogPostCategory RENAME COLUMN blogPostId TO postId;

-- Add assignedAt timestamp to BlogPostCategory
ALTER TABLE BlogPostCategory ADD COLUMN assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP;

COMMIT;
