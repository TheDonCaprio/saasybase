# Per-Member Shared Token Cap Proposal

## Objectives
- Prevent a single workspace member from exhausting the entire shared token pool.
- Keep `/api/user/profile` and dashboard consumers aligned so members understand both personal and workspace limits.
- Give workspace owners explicit controls (UI + API) for setting, auditing, and overriding member caps.
- Ensure billing/Stripe flows remain source of truth for the shared pool while respecting per-member ceilings when tokens are minted or consumed.

## Schema & Prisma Changes
### 1. `Organization`
Add columns to store defaults and enforcement flags at the workspace level:
- `memberTokenCap` (`Int?`): max shared tokens a single member can hold before throttling usage. `null` means unlimited.
- `memberCapStrategy` (`String`, default `"SOFT"`): enum-like string that controls enforcement (`SOFT`, `HARD`, `DISABLED`).
- `memberCapResetIntervalHours` (`Int?`): optional rolling window for cap resets (align with billing cycle, default `null` → use plan duration).

### 2. `OrganizationMembership`
Store per-member overrides and rolling counters:
- `sharedTokenBalance` (`Int`, default `0`): denormalized slice of the shared pool currently earmarked for this member (mirrors dedupe logic already shown in AccountMenu, Dashboard drawers).
- `memberTokenCapOverride` (`Int?`): manual override; falls back to organization default when `null`.
- `memberTokenUsageWindowStart` (`DateTime?`): start timestamp for the rolling window.
- `memberTokenUsage` (`Int`, default `0`): amount consumed within the active window.

### 3. Prisma Client Updates
- Regenerate Prisma client after modifying `prisma/schema.prisma`.
- Create helper selectors (e.g., `ORGANIZATION_WITH_CAPS_SELECT`) in `lib/user-plan-context.ts` and `lib/teams.ts` so existing context builders automatically expose the new fields.

## API & Contract Updates
1. `/api/user/profile`
   - Include `profile.sharedTokens.cap` (number or `null`) and `profile.sharedTokens.strategy` to inform client components.
   - Surface `profile.organization.memberTokenCap` + `capStrategy` so dashboard cards and admin drawers can show workspace rules.
   - When returning `profile.sharedTokens.remaining`, ensure it reflects the **member-specific** balance (min of shared pool and member cap) to keep dedupe logic consistent.

2. `/api/admin/organizations/[id]`
   - Accept `memberTokenCap`, `memberCapStrategy`, and `memberCapResetIntervalHours` in PATCH/PUT payloads.
   - Expose membership overrides when listing members, including effective cap and current usage.

3. `lib/user-plan-context`
   - Append `perMemberCap` metadata to `planDisplay` (e.g., `planDisplay.memberCapSummary`) so dashboard cards can highlight caps the same way they call out workspace sharing today.

## Admin & Dashboard UI
1. **Admin → Organizations → Billing tab**
   - Add a "Per-member shared token cap" panel with controls:
     - Input for default cap (number + "Unlimited" toggle).
     - Strategy selector (`Soft: warn only`, `Hard: block usage`, `Disabled`).
     - Reset cadence dropdown (billing cycle, monthly, custom hours).
   - Display live shared pool values and links to member-level overrides.

2. **Admin → Organizations → Members table**
   - New columns for `Effective cap`, `Usage this window`, and action menu (`Edit override`, `Reset usage`).
   - Modal to edit `memberTokenCapOverride` or clear counters.

3. **Dashboard (workspace members)**
   - Extend `AccountMenu`, `DashboardHeaderDrawer`, and `AdminHeaderDrawer` badges to show "Workspace cap: X tokens" when `profile.sharedTokens.cap` is set.
   - Inside dashboard hero cards (`app/dashboard/activity`, `/plan`, `/profile`), render helper text `Workspace cap per member: X tokens (soft/hard)` using `planDisplay.memberCapSummary`.

## Enforcement Hooks
1. **Token Credit Events (Stripe webhooks, manual grants)**
   - `lib/stripe.ts` and `lib/teams.ts` already centralize shared token credits. Update `creditOrganizationSharedTokens` to optionally rebalance member slices when new tokens arrive (e.g., bump each member's `sharedTokenBalance` up to their cap while respecting total supply).
2. **Feature usage & render pipeline**
   - In `lib/teams.ts` / `lib/user-helpers.ts`, introduce `assertMemberCap({ userId, organizationId, cost })` that:
     - Loads membership usage counters.
     - Short-circuits or throws when a hard cap would be exceeded.
     - Logs + returns warning metadata for soft caps.
   - Call this helper from feature entry points (render API routes, job queues) before decrementing the shared pool.
3. **Scheduled Reset Job**
   - Cron (existing `scripts/` dir) to sweep memberships nightly:
     - If `memberTokenUsageWindowStart` + interval < now, reset usage + re-align `sharedTokenBalance` with cap/default.
     - Email owners when repeated soft-cap warnings occur.

## Rollout Plan
1. **Phase 0 – Migration safety**
   - Backfill `OrganizationMembership.sharedTokenBalance` with `0` and set organization defaults to `null`/`SOFT` so behavior is unchanged until owners opt in.
2. **Phase 1 – Admin visibility**
   - Ship admin UI & API for setting caps, but keep enforcement helper in "warn only" telemetry mode. Capture metrics in `SystemLog` for owners.
3. **Phase 2 – Soft enforcement**
   - Allow owners to set `SOFT` vs `HARD`. Soft mode surfaces warnings in dashboard UI and sends weekly digests.
4. **Phase 3 – Hard enforcement + automation**
   - Enable queues/job hooks to actually block usage when `memberTokenUsage + cost > cap` and strategy === `HARD`.
   - Add notification hooks to alert members/owners immediately when blocked.
5. **Phase 4 – Workspace self-service**
   - Let members request temporary cap bumps via dashboard (creates admin task / email) while keeping owners in control.

## File Touchpoints Summary
- `prisma/schema.prisma` + migration for new columns.
- `lib/user-plan-context.ts`, `lib/teams.ts`, `lib/user-helpers.ts` for context + enforcement logic.
- API routes: `/api/user/profile`, `/api/admin/organizations/[id]`, related validation schemas.
- UI: `components/AccountMenu.tsx`, `components/dashboard/DashboardHeaderDrawer.tsx`, `components/admin/AdminHeaderDrawer.tsx`, dashboard hero cards, admin org screens.
- Background jobs: new script under `scripts/reset-member-caps.ts` or extend existing scheduler.
