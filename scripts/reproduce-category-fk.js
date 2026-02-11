#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
(async function main(){
  const prisma = new PrismaClient();
  try {
    // Find one blog post
    const post = await prisma.sitePage.findFirst({ where: { collection: 'blog' } });
    if (!post) {
      console.error('No blog post found in DB. Aborting.');
      process.exit(1);
    }
    console.log('Using post id:', post.id);
      console.log('Post record:', post);

    // Find one category to use as a slug
    const category = await prisma.blogCategory.findFirst();
    if (!category) {
      console.error('No blog category found in DB. Aborting.');
      process.exit(1);
    }
    console.log('Found category id:', category.id, 'slug:', category.slug);
      console.log('Category record:', category);

    // Attempt 1: try creating a join row using the slug as categoryId (this should fail with FK)
    console.log('\nAttempt 1: inserting using slug as categoryId (should trigger FK violation)');
    try {
      // Double-check existence via raw counts
      const postCount = await prisma.sitePage.count({ where: { id: post.id } });
      const catCount = await prisma.blogCategory.count({ where: { id: category.id } });
      console.log('Existence check - postCount:', postCount, 'catCount:', catCount);
      await prisma.blogPostCategory.create({ data: { postId: post.id, categoryId: category.slug } });
      console.log('Unexpected success inserting with slug as categoryId');
    } catch (err) {
      console.error('Expected error (inserting slug as categoryId):', err.message || err);
    }

    // Attempt 2: insert using correct category id (should succeed or already exist)
    console.log('\nAttempt 2: inserting using correct category id');
    try {
      const created = await prisma.blogPostCategory.create({ data: { postId: post.id, categoryId: category.id } });
      console.log('Inserted join row:', created);
      // Clean up if we inserted
      await prisma.blogPostCategory.delete({ where: { id: created.id } });
      console.log('Cleaned up inserted row');
    } catch (err) {
      console.error('Error inserting with correct id (may already exist):', err.message || err);
    }
  } catch (err) {
    console.error('Unexpected error running reproduce script:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
