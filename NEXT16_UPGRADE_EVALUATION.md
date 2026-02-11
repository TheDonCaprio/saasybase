# Next.js 16 upgrade evaluation (sandbox)

Date: 2026-02-10

## What “latest stable” is

- `npm view next version` → **16.1.6**
- `npm view next dist-tags` → `latest: 16.1.6`, `canary: 16.2.0-canary.33` (at time of this check)

## Sandbox result

Sandbox folder: `pro-app-next16-sandbox/`

- ✅ `npm run typecheck` passes
- ✅ `npm run build` passes (`next build --webpack`)

This means a Next 16 upgrade is *feasible* for this app, but it requires a non-trivial (mostly mechanical) set of code changes.

## What broke in *this* codebase (and the required fixes)

### 1) Route handlers: `context.params` became Promise-like

**Symptom**
- Build/type errors coming from `.next/types/...` validators, complaining that the route handler context params are a `Promise`.

**Fix pattern**
- Change handler signature typing to `context: { params: Promise<{ ... }> }`
- Resolve params via `const params = await context.params;` and then use `params.<field>`.

**Impact**
- Many files under `app/api/**/route.ts` required this.

### 2) Page components: `params` / `searchParams` became Promise-like

**Symptom**
- Next 16 build-time typing required page props like `params` and `searchParams` to satisfy Promise-like constraints.

**Fix pattern**
- For dynamic segments:
  - `params: Promise<{ slug: string }>` and `const { slug } = await params;`
- For query params:
  - `searchParams?: Promise<Record<string, string | string[] | undefined>>`
  - `const resolvedSearchParams = await searchParams;` then read from `resolvedSearchParams`.

**Impact**
- Multiple pages across `app/**/page.tsx` (admin, blog, dashboard, sign-in/up, etc.).

### 3) Server Components: `next/dynamic(..., { ssr: false })` not allowed

**Symptom**
- Build error: `ssr:false` is not allowed with `next/dynamic` in Server Components.

**Fix options**
- Prefer moving that logic into a Client Component (`'use client'`) and import there.
- Or remove the dynamic import and import the component normally if it’s already client-safe.

**Impact**
- Hit at least once in `components/dashboard/CurrentPlanStatus.tsx`.

### 4) Clerk server auth became async

**Symptom**
- Server-side auth usage needed to switch from sync to async.

**Fix pattern**
- Replace usages with `const { userId } = await auth()` (or equivalent) in server contexts.

**Impact**
- Widespread but mechanical.

### 5) Tooling: ESLint 9 flat config

**Symptom**
- ESLint config needed to match ESLint 9 expectations.

**Fix pattern**
- Use ESLint 9 + flat config approach (as done in sandbox).

## Warnings observed (non-blocking, but should be handled)

### A) Output tracing root warning (multiple lockfiles)

**Warning**
- Next inferred an incorrect workspace root due to multiple lockfiles.

**Fix**
- Add `outputFileTracingRoot` to `next.config.mjs`.
- Implemented in sandbox: `next.config.mjs` now sets `outputFileTracingRoot: __dirname`.

### B) Middleware convention deprecation

**Warning**
- Next warns: “The `middleware` file convention is deprecated. Please use `proxy` instead.”

**What to do**
- Plan a migration of the current `middleware.ts` behavior to the newer “proxy” convention.
- Not required to get a green build today, but likely required for forward compatibility.

## Suggested upgrade approach for `pro-app/`

1. **Do it in isolation first** (same approach we used)
   - Copy `pro-app/` → `pro-app-next16-sandbox/` (or do it on a branch).

2. **Bump versions together**
   - `next@16.1.6`, `eslint-config-next@16.1.6`
   - `eslint@9.x`
   - Clerk `@clerk/nextjs@6.x`
   - Keep React `18.3.x` (as sandbox)

3. **Run the two gates**
   - `npm run typecheck`
   - `npm run build`

4. **Apply mechanical refactors as they appear**
   - Route handlers: `await context.params`
   - Pages: `await params` / `await searchParams`
   - Remove/relocate `dynamic(..., { ssr:false })` in Server Components

5. **Address warnings**
   - Add `outputFileTracingRoot`
   - Track “middleware → proxy” migration separately (but soon)

## QA checklist (target the changed surfaces)

- Auth flows: sign-in, sign-up, invite accept, org access gating
- Dashboard pages that use query params (`searchParams`) and dynamic segments (`params`)
- Admin pages (analytics, coupons, blog/page editors)
- Checkout flows and provider webhooks (Stripe/Paddle/Paystack/Razorpay)
- Any client-only widgets that might have been moved across the Server/Client boundary

## Risk summary

- **Main risk**: lots of small, mechanical changes across many files; easy to miss one without a full `next build` run.
- **Runtime risk areas**: auth boundary changes (async Clerk), middleware/proxy behavior, and any component that accidentally becomes a Server Component.
- **Overall**: moderate effort, mostly deterministic; sandbox now proves it can be brought to green.
