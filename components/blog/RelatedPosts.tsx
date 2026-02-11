import Link from 'next/link';
import Image from 'next/image';
import { listPublishedBlogPosts, BlogPostDTO, toBlogPostDTO } from '@/lib/blog';

interface Category { slug: string }

export default async function RelatedPosts({ currentSlug, categories }: { currentSlug: string; categories?: Category[] }): Promise<JSX.Element | null> {
  let related: BlogPostDTO[] = [];

  if (categories && categories.length > 0) {
    try {
      const first = categories[0].slug;
      const res = await listPublishedBlogPosts({ page: 1, limit: 8, categorySlug: first });
      related = res.posts.filter((p) => p.slug !== currentSlug).map(p => toBlogPostDTO(p));
    } catch {
      related = [];
    }
  }

  if (!related || related.length < 4) {
    const res = await listPublishedBlogPosts({ page: 1, limit: 8 });
    const fallback = res.posts.filter((p) => p.slug !== currentSlug).map(p => toBlogPostDTO(p));
    // merge keeping uniqueness
    const existingSlugs = new Set(related.map((r) => r.slug));
    for (const p of fallback) {
      if (existingSlugs.has(p.slug)) continue;
      related.push(p);
      existingSlugs.add(p.slug);
      if (related.length >= 4) break;
    }
  }

  related = related.slice(0, 4);

  if (!related.length) return null;

  return (
    <section className="mt-12">
      <h3 className="text-xl font-semibold mb-4">Related posts</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {related.map((post) => (
          <article key={post.id} className="rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <Link href={`/blog/${post.slug}`}>
              <div className="p-3 h-full flex flex-col">
                {post.ogImage ? (
                    <div className="w-full h-28 relative rounded overflow-hidden mb-3">
                    <Image src={post.ogImage} alt={post.title} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                  </div>
                ) : null}
                <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2">{post.title}</h4>
                <time className="text-xs text-neutral-500 mt-2">{new Date(post.publishedAt || post.createdAt).toLocaleDateString()}</time>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
