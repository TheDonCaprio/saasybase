# Clerk 7 Migration Plan

Status legend:
- `[ ]` not started
- `[-]` in progress
- `[x]` completed

## Phase 0: Baseline

- [x] Confirm current baseline stays green
  - Run `npm run typecheck`
  - Run `npm run build`
  - Run `npm test -- --run`
  - Run targeted org-switcher E2E after selector hardening

## Phase 1: Hardening Before Upgrade

- [x] Remove brittle Clerk DOM dependencies from app-owned code and tests
  - [x] Replace account-menu outside-click guard that relied on Clerk-generated class names
  - [x] Replace org-switcher E2E selector that relied on Clerk-generated class names
  - [ ] Repeat the same hardening for other org-switcher surfaces if needed

- [ ] Centralize direct Clerk backend usage behind provider abstractions where practical
  - [x] Review invite revoke flow
  - [x] Review invite decline flow
  - [x] Review organization cleanup flow

## Phase 2: Middleware And Server Auth

- [x] Review Clerk 7 import paths and runtime contract in middleware layer
  - Files:
    - [lib/auth-provider/middleware.ts](lib/auth-provider/middleware.ts)
    - [proxy.ts](proxy.ts)

  - Progress:
    - [x] Replace `require()`-based Clerk middleware imports with direct server imports in [lib/auth-provider/middleware.ts](lib/auth-provider/middleware.ts)
    - [x] Re-check `proxy.ts` callback contract against Clerk 7 middleware behavior

- [ ] Re-validate `auth()`, `currentUser()`, and `clerkClient()` assumptions
  - Files:
    - [lib/auth-provider/providers/clerk.ts](lib/auth-provider/providers/clerk.ts)
    - [lib/organization-access.ts](lib/organization-access.ts)

## Phase 3: Organization And Invitation APIs

- [-] Update organization API calls to Clerk 7 canonical methods
  - Files:
    - [lib/auth-provider/providers/clerk.ts](lib/auth-provider/providers/clerk.ts)
    - [lib/organization-access.ts](lib/organization-access.ts)
    - [app/api/team/invite/revoke/route.ts](app/api/team/invite/revoke/route.ts)
    - [app/api/team/invite/decline/route.ts](app/api/team/invite/decline/route.ts)

  - Progress:
    - [x] Add typed organization invitation revocation to the auth provider abstraction
    - [x] Route invite revoke and decline handlers through `authService.revokeOrganizationInvitation()`
    - [x] Review organization cleanup and list APIs in [lib/organization-access.ts](lib/organization-access.ts)

## Phase 4: Webhooks

- [x] Replace deprecated verification fallbacks with the Clerk 7 recommended path
  - Files:
    - [app/api/webhooks/clerk/route.ts](app/api/webhooks/clerk/route.ts)
    - [lib/auth-provider/providers/clerk.ts](lib/auth-provider/providers/clerk.ts)

  - Progress:
    - [x] Route webhook verification through `authService.verifyWebhook()`
    - [x] Normalize supported Svix/Clerk signature headers inside the Clerk provider
    - [x] Add focused route coverage for verified and rejected webhook requests

## Phase 5: Client Provider, Hooks, And UI

- [x] Verify Clerk 7 client export paths
  - Files:
    - [lib/auth-provider/client/providers/clerk/components.tsx](lib/auth-provider/client/providers/clerk/components.tsx)

- [x] Verify Clerk 7 hook return shapes and wrapped user/session behavior
  - Files:
    - [lib/auth-provider/client/providers/clerk/hooks.tsx](lib/auth-provider/client/providers/clerk/hooks.tsx)

  - Progress:
    - [x] Keep client imports routed through the app-owned auth barrel
    - [x] Widen `openUserProfile()` wrapper options to tolerate Clerk-specific modal options

- [x] Re-validate provider props and appearance slots
  - Files:
    - [components/AppAuthProvider.tsx](components/AppAuthProvider.tsx)
    - [app/sign-in/[[...sign-in]]/page.tsx](app/sign-in/[[...sign-in]]/page.tsx)
    - [app/sign-up/[[...sign-up]]/page.tsx](app/sign-up/[[...sign-up]]/page.tsx)
    - [components/pricing/PricingCard.tsx](components/pricing/PricingCard.tsx)
    - [components/dashboard/ClerkProfileInline.tsx](components/dashboard/ClerkProfileInline.tsx)

  - Progress:
    - [x] Centralize `ClerkProvider` appearance configuration in [lib/auth-provider/client/clerk-appearance.ts](lib/auth-provider/client/clerk-appearance.ts)
    - [x] Centralize sign-in and sign-up page appearance configuration in [lib/auth-provider/client/clerk-appearance.ts](lib/auth-provider/client/clerk-appearance.ts)

- [x] Re-validate OrganizationSwitcher appearance slot names and interactions
  - Files:
    - [components/AccountMenu.tsx](components/AccountMenu.tsx)
    - [components/dashboard/DashboardHeaderDrawer.tsx](components/dashboard/DashboardHeaderDrawer.tsx)
    - [components/admin/AdminHeaderDrawer.tsx](components/admin/AdminHeaderDrawer.tsx)
    - [components/dashboard/SidebarFooter.tsx](components/dashboard/SidebarFooter.tsx)

  - Progress:
    - [x] Centralize shared OrganizationSwitcher appearance maps in [lib/auth-provider/client/clerk-appearance.ts](lib/auth-provider/client/clerk-appearance.ts)
    - [x] Remove the remaining inline admin drawer OrganizationSwitcher appearance map

- [x] Re-validate profile appearance surfaces
  - Files:
    - [components/dashboard/ClerkProfileInline.tsx](components/dashboard/ClerkProfileInline.tsx)
    - [components/dashboard/ClerkProfileModal.tsx](components/dashboard/ClerkProfileModal.tsx)

  - Progress:
    - [x] Centralize profile appearance configuration in [lib/auth-provider/client/clerk-appearance.ts](lib/auth-provider/client/clerk-appearance.ts)

## Phase 6: Tests And Final Validation

- [ ] Update mocks that depend on Clerk server module shape
  - Files:
    - [tests/natural-expiry-grace.test.ts](tests/natural-expiry-grace.test.ts)

  - Progress:
    - [x] Align the Clerk server mock with current provider-side organization and user calls in [tests/natural-expiry-grace.test.ts](tests/natural-expiry-grace.test.ts)

- [x] Re-run targeted tests after each phase
  - Target tests:
    - [tests/e2e/org-switcher-regression.spec.ts](tests/e2e/org-switcher-regression.spec.ts)
    - [tests/e2e/dashboard-navigation-smoke.spec.ts](tests/e2e/dashboard-navigation-smoke.spec.ts)
    - [tests/natural-expiry-grace.test.ts](tests/natural-expiry-grace.test.ts)

- [x] Final verification gate
  - Run `npm run typecheck`
  - Run `npm run build`
  - Run `npm test -- --run`
  - Verified after upgrading `@clerk/nextjs` to `7.0.6`

## Current Slice

- [x] Phase 6 final validation
  - Goal: run the remaining validation gate before touching the Clerk package version.
  - Exit criteria:
    - Targeted auth and org tests pass after the preparation work.
    - Full verification gate is run before the actual dependency bump.