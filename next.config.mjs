/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevelopment = process.env.NODE_ENV !== 'production';
const isContentSecurityPolicyEnabled = process.env.ENABLE_CSP === 'true';
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function buildContentSecurityPolicy() {
  const directives = [
    [
      'default-src',
      "'self'",
    ],
    [
      'base-uri',
      "'self'",
    ],
    [
      'object-src',
      "'none'",
    ],
    [
      'frame-ancestors',
      "'none'",
    ],
    [
      'form-action',
      "'self'",
    ],
    [
      'script-src',
      "'self'",
      "'unsafe-inline'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      'https://challenges.cloudflare.com',
      'https://*.clerk.accounts.dev',
      'https://*.clerk.dev',
      'https://clerk.com',
      'https://*.clerk.com',
      'https://pagead2.googlesyndication.com',
      'https://googleads.g.doubleclick.net',
      'https://securepubads.g.doubleclick.net',
      'https://tpc.googlesyndication.com',
      'https://www.googletagmanager.com',
      'https://js.stripe.com',
      'https://platform.twitter.com',
      'https://js.paystack.co',
      'https://checkout.razorpay.com',
      'https://cdn.paddle.com',
    ],
    [
      'style-src',
      "'self'",
      "'unsafe-inline'",
    ],
    [
      'img-src',
      "'self'",
      'data:',
      'blob:',
      'https:',
    ],
    [
      'font-src',
      "'self'",
      'data:',
      'https://fonts.gstatic.com',
    ],
    [
      'connect-src',
      "'self'",
      'https://challenges.cloudflare.com',
      'https://*.clerk.accounts.dev',
      'https://*.clerk.dev',
      'https://clerk.com',
      'https://*.clerk.com',
      'https://*.s3.amazonaws.com',
      'https://*.s3.*.amazonaws.com',
      'https://s3.*.amazonaws.com',
      'https://s3.amazonaws.com',
      'https://*.cloudfront.net',
      'https://pagead2.googlesyndication.com',
      'https://googleads.g.doubleclick.net',
      'https://securepubads.g.doubleclick.net',
      'https://tpc.googlesyndication.com',
      'https://api.stripe.com',
      'https://js.stripe.com',
      'https://hooks.stripe.com',
      'https://m.stripe.network',
      'https://q.stripe.com',
      'https://r.stripe.com',
      'https://www.google-analytics.com',
      'https://region1.google-analytics.com',
      'https://stats.g.doubleclick.net',
      'https://www.googletagmanager.com',
      'https://platform.twitter.com',
      'https://syndication.twitter.com',
      'https://*.paystack.co',
      'https://*.razorpay.com',
      'https://*.paddle.com',
      ...(isDevelopment ? ['http://localhost:*', 'ws://localhost:*'] : []),
    ],
    [
      'frame-src',
      "'self'",
      'https://challenges.cloudflare.com',
      'https://*.clerk.accounts.dev',
      'https://*.clerk.dev',
      'https://clerk.com',
      'https://*.clerk.com',
      'https://pagead2.googlesyndication.com',
      'https://googleads.g.doubleclick.net',
      'https://securepubads.g.doubleclick.net',
      'https://tpc.googlesyndication.com',
      'https://js.stripe.com',
      'https://hooks.stripe.com',
      'https://platform.twitter.com',
      'https://syndication.twitter.com',
      'https://js.paystack.co',
      'https://checkout.razorpay.com',
      'https://cdn.paddle.com',
      'https://*.paddle.com',
    ],
    [
      'worker-src',
      "'self'",
      'blob:',
    ],
    [
      'media-src',
      "'self'",
      'blob:',
      'data:',
    ],
    [
      'manifest-src',
      "'self'",
    ],
    ...(!isDevelopment ? [[
      'upgrade-insecure-requests',
    ]] : []),
  ];

  return directives
    .map(([name, ...values]) => `${name} ${values.join(' ')}`.trim())
    .join('; ');
}

const contentSecurityPolicy = buildContentSecurityPolicy();

const nextConfig = {
  // Most installs only use the default dev origin, so keep extra dev origins
  // opt-in via ALLOWED_DEV_ORIGINS="host1,host2,*.example.test".
  ...(allowedDevOrigins.length ? { allowedDevOrigins } : {}),

  // Expose AUTH_PROVIDER to client-side code under NEXT_PUBLIC_ prefix.
  // This enables build-time conditional imports in the auth abstraction layer.
  env: {
    NEXT_PUBLIC_AUTH_PROVIDER: process.env.AUTH_PROVIDER || 'clerk',
    NEXT_PUBLIC_ADMIN_ONLY_PUBLIC_SITE: process.env.ADMIN_ONLY_PUBLIC_SITE || 'false',
  },

  // Prevent output tracing from walking up to an unrelated workspace root
  // when multiple lockfiles exist on the machine.
  outputFileTracingRoot: __dirname,

  // Keep compiled dev pages in memory much longer so switching between open
  // tabs doesn't trigger a visible recompilation / page flash.
  // Default maxInactiveAge is ~60 s in webpack mode which is too short when
  // multiple routes are open during development.
  onDemandEntries: {
    // 30 minutes – pages stay warm long enough for normal dev workflows
    maxInactiveAge: 30 * 60 * 1000,
    // Keep up to 25 pages buffered (default is 5)
    pagesBufferLength: 25,
  },

  // Prevent Next.js from bundling @react-pdf/renderer through its RSC webpack
  // transform. Bundling it causes a React instance conflict (two separate React
  // reconciler copies) that triggers React error #31 ("Objects are not valid as
  // React children") when pdf().toBlob() tries to render the element tree.
  // Marking it external makes Node.js require() it at runtime, so it shares the
  // same React module from node_modules as the rest of the app.
  serverExternalPackages: ['@react-pdf/renderer'],

  // Security headers for production. CSP is opt-in because the default
  // boilerplate integrates multiple third-party providers and a strict global
  // policy creates constant setup friction for new services.
  async headers() {
    const baseSecurityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'origin-when-cross-origin',
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=()',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      },
    ];

    if (isContentSecurityPolicyEnabled) {
      baseSecurityHeaders.push({
        key: 'Content-Security-Policy',
        value: contentSecurityPolicy,
      });
    }

    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: baseSecurityHeaders,
      },
      {
        // Additional security for API routes
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];
  },
  
  // Suppress hydration warnings from browser extensions like Grammarly
  reactStrictMode: true,
    // Temporarily ignore ESLint during builds so lint warnings don't fail production build.
    // This is a pragmatic short-term change while we address the many lint/type warnings
    // across the codebase. Remove or set to false once the codebase is cleaned up.
    // eslint: { ignoreDuringBuilds: true }, // removed: re-enable strict linting for builds
  // Allow next/image to load logos from S3 and common CDNs used in production.
  // Adjust these patterns to match your production bucket / CDN hostnames.
  images: {
    remotePatterns: [
      // Virtual-hosted style buckets: <bucket>.s3.amazonaws.com
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
      // Region-specific endpoints and virtual-hosted: <bucket>.s3.<region>.amazonaws.com
      {
        protocol: 'https',
        hostname: '*.s3.*.amazonaws.com',
      },
      // Path-style S3 endpoints: s3.<region>.amazonaws.com (no bucket subdomain)
      {
        protocol: 'https',
        hostname: 's3.*.amazonaws.com',
      },
      // Global S3 path-style endpoint
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
      },
      // Common CDN / CloudFront
      {
        protocol: 'https',
        hostname: '*.cloudfront.net',
      },
      // Clerk-hosted avatars and profile images
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      // GitHub OAuth avatar images
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      // Google OAuth avatar images
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },
  
  // Custom webpack config to suppress known browser extension warnings
  webpack: (config, { dev, isServer }) => {
    const sentryInstrumentationWarningRules = [
      (warning, compilation) => {
        try {
          if (!warning.module || !compilation?.requestShortener) {
            return false;
          }

          const readableIdentifier = warning.module.readableIdentifier(compilation.requestShortener);
          const isKnownSentryInstrumentationWarning =
            /@opentelemetry\/instrumentation/.test(readableIdentifier)
            || /@prisma\/instrumentation/.test(readableIdentifier)
            || /require-in-the-middle/.test(readableIdentifier);

          return isKnownSentryInstrumentationWarning && /Critical dependency/.test(warning.message || '');
        } catch {
          return false;
        }
      },
      { module: /@opentelemetry\/instrumentation/, message: /Critical dependency/ },
      { module: /@prisma\/instrumentation/, message: /Critical dependency/ },
      { module: /require-in-the-middle/, message: /Critical dependency/ },
    ];

    if (config.ignoreWarnings === undefined) {
      config.ignoreWarnings = sentryInstrumentationWarningRules;
    } else if (Array.isArray(config.ignoreWarnings)) {
      config.ignoreWarnings.push(...sentryInstrumentationWarningRules);
    }

    if (dev && !isServer) {
      // Suppress Grammarly and other browser extension warnings in development
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    if (dev) {
      // Reduce false-positive file-change detections that trigger unnecessary
      // recompilation / page refreshes in development. Ignore directories that
      // frequently write artefacts unrelated to the running app code.
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/prisma/migrations/**',
          '**/test_output*',
          '**/*.test.*',
          '**/*.spec.*',
        ],
      };
    }

    return config;
  },
};

export default nextConfig;
