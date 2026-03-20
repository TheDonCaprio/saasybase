/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // Allow accessing the dev server from local network devices and the current
  // ngrok tunnel so HMR and other Next.js dev assets are not blocked.
  allowedDevOrigins: [
    '192.168.0.11',
    'tanisha-nonreputable-corrin.ngrok-free.dev',
  ],

  // Expose AUTH_PROVIDER to client-side code under NEXT_PUBLIC_ prefix.
  // This enables build-time conditional imports in the auth abstraction layer.
  env: {
    NEXT_PUBLIC_AUTH_PROVIDER: process.env.AUTH_PROVIDER || 'clerk',
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

  // Security headers for production
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
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
        ],
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
    ],
  },
  
  // Custom webpack config to suppress known browser extension warnings
  webpack: (config, { dev, isServer }) => {
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
