#!/usr/bin/env node
const { createPrismaClient } = require('./create-prisma-client.cjs');
(async function main(){
  const prisma = await createPrismaClient();
  try {
    console.log('Running PRAGMA and schema inspection for BlogPostCategory...');
    const tableInfo = await prisma.$queryRawUnsafe("PRAGMA table_info('BlogPostCategory')");
    console.log('PRAGMA table_info BlogPostCategory:', tableInfo);
    const fkList = await prisma.$queryRawUnsafe("PRAGMA foreign_key_list('BlogPostCategory')");
    console.log('PRAGMA foreign_key_list BlogPostCategory:', fkList);
    const sql = await prisma.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE type='table' AND name='BlogPostCategory'");
    console.log('sqlite_master SQL for BlogPostCategory:', sql);
    // Also show referenced tables existence
    const sitePageCount = await prisma.sitePage.count();
    const blogCategoryCount = await prisma.blogCategory.count();
    console.log('SitePage count:', sitePageCount, 'BlogCategory count:', blogCategoryCount);
  } catch (err) {
    console.error('Error inspecting schema:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
