/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // Prevent output tracing from walking up to an unrelated workspace root
  // when multiple lockfiles exist on the machine.
  outputFileTracingRoot: __dirname,

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
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },

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
    return config;
  },
};

export default nextConfig;
