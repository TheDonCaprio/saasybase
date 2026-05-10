import { getConfiguredSiteUrl, resolveSeoUrl } from './seo-shared';

type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>;

export function serializeJsonLd(data: JsonLdValue): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function absoluteUrl(pathOrUrl: string, siteUrl: string): string {
  return new URL(pathOrUrl, `${siteUrl}/`).toString();
}

export function buildBreadcrumbSchema(
  items: Array<{ name: string; path?: string }>,
  siteUrl?: string,
) {
  const resolvedSiteUrl = siteUrl || getConfiguredSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: absoluteUrl(item.path, resolvedSiteUrl) } : {}),
    })),
  };
}

export function buildOrganizationSchema(options: {
  siteName: string;
  siteUrl?: string;
  logoUrl?: string | null;
}) {
  const siteUrl = options.siteUrl || getConfiguredSiteUrl();
  const resolvedLogoUrl = resolveSeoUrl(options.logoUrl, { siteUrl, sameOriginOnly: false });

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: options.siteName,
    url: siteUrl,
    ...(resolvedLogoUrl ? { logo: resolvedLogoUrl } : {}),
  };
}

export function buildSoftwareApplicationSchema(options: {
  siteName: string;
  siteUrl?: string;
  description: string;
}) {
  const siteUrl = options.siteUrl || getConfiguredSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: options.siteName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteUrl,
    description: options.description,
  };
}

export function buildCollectionPageSchema(options: {
  title: string;
  description?: string;
  path: string;
  siteUrl?: string;
}) {
  const siteUrl = options.siteUrl || getConfiguredSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: options.title,
    description: options.description,
    url: absoluteUrl(options.path, siteUrl),
  };
}

export function buildWebPageSchema(options: {
  title: string;
  description?: string | null;
  path: string;
  siteUrl?: string;
  dateModified?: string;
}) {
  const siteUrl = options.siteUrl || getConfiguredSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: options.title,
    description: options.description || undefined,
    url: absoluteUrl(options.path, siteUrl),
    ...(options.dateModified ? { dateModified: options.dateModified } : {}),
  };
}

export function buildContactPageSchema(options: {
  title: string;
  description?: string | null;
  path: string;
  siteName: string;
  siteUrl?: string;
  email?: string | null;
}) {
  const siteUrl = options.siteUrl || getConfiguredSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: options.title,
    description: options.description || undefined,
    url: absoluteUrl(options.path, siteUrl),
    mainEntity: {
      '@type': 'Organization',
      name: options.siteName,
      url: siteUrl,
      ...(options.email ? { email: options.email } : {}),
    },
  };
}

export function buildTechArticleSchema(options: {
  title: string;
  description?: string | null;
  path: string;
  siteName: string;
  siteUrl?: string;
  about?: string[];
}) {
  const siteUrl = options.siteUrl || getConfiguredSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: options.title,
    description: options.description || undefined,
    url: absoluteUrl(options.path, siteUrl),
    mainEntityOfPage: absoluteUrl(options.path, siteUrl),
    author: {
      '@type': 'Organization',
      name: options.siteName,
    },
    publisher: {
      '@type': 'Organization',
      name: options.siteName,
    },
    ...(options.about && options.about.length > 0
      ? {
          about: options.about.map((name) => ({
            '@type': 'Thing',
            name,
          })),
        }
      : {}),
  };
}

export function buildBlogPostingSchema(options: {
  title: string;
  description?: string | null;
  path: string;
  siteName: string;
  siteUrl?: string;
  imageUrl?: string | null;
  datePublished: string;
  dateModified: string;
}) {
  const siteUrl = options.siteUrl || getConfiguredSiteUrl();
  const resolvedImageUrl = resolveSeoUrl(options.imageUrl, { siteUrl, sameOriginOnly: false });

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: options.title,
    description: options.description || undefined,
    url: absoluteUrl(options.path, siteUrl),
    mainEntityOfPage: absoluteUrl(options.path, siteUrl),
    datePublished: options.datePublished,
    dateModified: options.dateModified,
    ...(resolvedImageUrl ? { image: [resolvedImageUrl] } : {}),
    author: {
      '@type': 'Organization',
      name: options.siteName,
    },
    publisher: {
      '@type': 'Organization',
      name: options.siteName,
    },
  };
}
