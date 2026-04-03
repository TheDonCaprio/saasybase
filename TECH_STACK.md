# TECH_STACK.md — Technology Stack Reference

> Complete technology stack for SaaSyBase with version info, purpose, and configuration notes.

---

## Core Framework

| Technology | Version | Purpose | Config |
|-----------|---------|---------|--------|
| **Next.js** | 16.x | Full-stack React framework (App Router) | `next.config.mjs` |
| **React** | 18.x | UI library | — |
| **TypeScript** | 5.x | Type safety | `tsconfig.json` |
| **Node.js** | 18+ | Runtime | — |

---

## Authentication (Switchable)

| Technology | Version | Purpose | When Active |
|-----------|---------|---------|-------------|
| **Clerk** | @clerk/nextjs 7.x | Managed auth with organizations, SSO, MFA | `AUTH_PROVIDER="clerk"` |
| **NextAuth (Auth.js)** | v5 beta | Self-hosted auth with credentials, OAuth, magic link | `AUTH_PROVIDER="nextauth"` |

**Auth is selected via env var** — the abstraction layer (`lib/auth-provider/`) provides a unified interface. Unused provider code is dead-code eliminated at build time.

### Clerk Dependencies
- `@clerk/nextjs` — Server + client auth
- `@clerk/themes` — Theming integration
- `@clerk/ui` — UI component primitives
- `svix` — Webhook signature verification

### NextAuth Dependencies
- `next-auth` v5 — Core auth framework
- `@auth/prisma-adapter` — Database adapter for sessions/accounts
- `bcryptjs` — Password hashing

---

## Payment Providers (Switchable)

| Technology | Purpose | When Active |
|-----------|---------|-------------|
| **Stripe** | Full-featured payments with subscriptions, proration, disputes | `PAYMENT_PROVIDER="stripe"` |
| **Paystack** | African payments (NGN, GHS, ZAR, KES, USD) | `PAYMENT_PROVIDER="paystack"` |
| **Paddle** | International payments with built-in tax handling | `PAYMENT_PROVIDER="paddle"` |
| **Razorpay** | Indian payments (INR, USD) | `PAYMENT_PROVIDER="razorpay"` |

### Payment Dependencies
- `stripe` — Stripe SDK
- `@stripe/stripe-js` + `@stripe/react-stripe-js` — Client-side Elements

Paystack, Paddle, and Razorpay use REST APIs directly (no SDK dependency).

---

## Database

| Technology | Version | Purpose | Config |
|-----------|---------|---------|--------|
| **Prisma** | 7.x | ORM with type-safe queries | `prisma/schema.prisma`, `prisma.config.ts` |
| **SQLite** | — | Development database (zero config) | `DATABASE_URL=file:./dev.db` |
| **PostgreSQL** | 14+ | Production database | `DATABASE_URL=postgresql://...` |

---

## Styling & UI

| Technology | Version | Purpose | Config |
|-----------|---------|---------|--------|
| **Tailwind CSS** | 3.x | Utility-first styling | `tailwind.config.ts` |
| **tailwind-merge** | 2.x | Conditional class merging | — |
| **clsx** | 2.x | Conditional classnames | — |
| **Font Awesome** | 6.x/7.x | Icon system | `@fortawesome/*` packages |

### Tailwind Customizations
- Brand color: indigo (`#6366f1`)
- Adjusted `md` breakpoint: `1025px`
- Extra font size: `xxs` (`0.6rem`)
- Dark mode via class strategy (`html.light` / `html.dark`)
- 60+ CSS custom properties for theme colors (generated server-side)

---

## Rich Text Editing

| Technology | Version | Purpose |
|-----------|---------|---------|
| **TipTap** | 3.x | WYSIWYG editor for blog posts, site pages, email templates |

### TipTap Extensions
- `@tiptap/starter-kit` — Core editing
- `@tiptap/extension-image` — Image embedding
- `@tiptap/extension-link` — Link editing
- `@tiptap/extension-color` + `text-style` — Text coloring
- `@tiptap/extension-highlight` — Text highlighting
- `@tiptap/extension-text-align` — Alignment
- `@tiptap/extension-underline` — Underline formatting
- `@tiptap/extension-youtube` — YouTube embeds
- `@tiptap/extension-horizontal-rule` — Horizontal dividers
- `@tiptap/extension-placeholder` — Placeholder text
- `@tiptap/extension-history` — Undo/redo

---

## Email

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Nodemailer** | 7.x | SMTP email transport |
| **Resend** | — | API-based email transport (alternative to SMTP) |

- **Dev:** MailHog (localhost:1025) or in-memory stream transport
- **Prod:** Any SMTP provider (SendGrid, SES, Mailgun, etc.) or Resend API
- **Selection:** `EMAIL_PROVIDER=nodemailer` (default) or `EMAIL_PROVIDER=resend`
- Templates stored in DB, editable from admin

---

## Data Fetching & State

| Technology | Version | Purpose |
|-----------|---------|---------|
| **TanStack React Query** | 5.x | Client-side data fetching, caching, mutations |
| **Zod** | 3.x | Schema validation for API inputs and form data |

---

## PDF Generation

| Technology | Version | Purpose |
|-----------|---------|---------|
| **pdf-lib** | 1.x | Server-side PDF generation (invoices, refund receipts) |
| **@react-pdf/renderer** | 3.x | React-based PDF rendering |

---

## Analytics

| Technology | Purpose |
|-----------|---------|
| **Google Analytics 4** | Client-side tracking (via GA snippet) |
| **GA4 Data API** | Server-side metrics for admin dashboard |
| **google-auth-library** | Service account auth for GA Data API |
| **First-party visit tracking** | `VisitLog` model + middleware (alternative to GA) |

---

## File Storage

| Technology | Purpose |
|-----------|---------|
| **Local filesystem** | Default logo/file storage (dev) |
| **AWS S3** | Production file storage |
| **CloudFront** | CDN for S3-hosted assets |

Optional dependency: `@aws-sdk/client-s3` (in `optionalDependencies`)

---

## Testing

| Technology | Version | Purpose | Config |
|-----------|---------|---------|--------|
| **Vitest** | latest | Unit & integration tests | `vitest.config.mts` |
| **Playwright** | 1.x | E2E browser tests | `playwright.config.ts` |

### Test Stats
- **90+ unit test files** covering payments, auth, subscriptions, tokens, webhooks
- **3 E2E test specs** for dashboard navigation, org switching, org deletion

---

## Build & Dev Tools

| Technology | Purpose |
|-----------|---------|
| **ESLint** | Linting (Next.js core web vitals + TypeScript rules) |
| **PostCSS** | CSS processing (Tailwind integration) |
| **Autoprefixer** | CSS vendor prefixes |
| **concurrently** | Run dev server + Stripe CLI in parallel |
| **tsx** | TypeScript execution for scripts |
| **dotenv** | Environment variable loading |

---

## Security

| Technology | Purpose |
|-----------|---------|
| **bcryptjs** | Password hashing (NextAuth) |
| **svix** | Webhook signature verification (Clerk) |
| **Built-in crypto** | Encryption at rest (ENCRYPTION_SECRET) |
| **DOMPurify** + **jsdom** | HTML sanitization (blog/CMS content) |

Optional dependencies: `dompurify`, `jsdom` (in `optionalDependencies`)

---

## Utilities

| Technology | Purpose |
|-----------|---------|
| **date-fns** | Date formatting and manipulation |
| **file-type** | File MIME type detection |
| **glob** | File pattern matching (scripts) |
| **puppeteer** | Browser automation (optional, for PDF/screenshot tasks) |
| **react-easy-crop** | Image cropping UI |
| **re-resizable** | Resizable UI panels |

---

## Architecture Decisions

### Why These Choices

| Decision | Rationale |
|----------|-----------|
| **Next.js App Router** | Server components, streaming, layouts, route handlers — all in one framework |
| **Prisma** | Type-safe queries, automatic migrations, great DX for vibecoders |
| **SQLite for dev** | Zero-config, no Docker required, works instantly on `npm install` |
| **Provider abstraction** | Swap auth/payment providers via env vars — no code changes needed |
| **Tailwind CSS** | Rapid styling, consistent design tokens, easy for AI agents to generate |
| **TipTap** | Extensible rich text editor, better DX than Slate, works with React |
| **Vitest** | Fast, Vite-native, compatible with Jest APIs, good TS support |
| **Zod** | Runtime validation that generates TypeScript types |
| **Database rate limiting** | Works across distributed deployments (not in-memory) |
| **DB-backed settings** | No redeployment needed for config changes — admin can update live |
