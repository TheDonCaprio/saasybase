export const adminOnlyPublicSiteMode =
  process.env.ADMIN_ONLY_PUBLIC_SITE === 'true'
  || process.env.NEXT_PUBLIC_ADMIN_ONLY_PUBLIC_SITE === 'true';
