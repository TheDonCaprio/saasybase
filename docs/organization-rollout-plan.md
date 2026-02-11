# Organization / Team Rollout Plan

_Last updated: 2025-11-18_

## Current Status
- ✅ Database schema ships with `Organization`, `OrganizationMembership`, and `OrganizationInvite` plus the plan/payment links added in migration `20251117223256_add_organizations`.
- ✅ `.env.example` + `lib/env.ts` validate the new `TEAM_SUBSCRIPTION_PRICE_*` variables and dev seeds include a representative team tier.
- ✅ Runtime wiring complete: `syncOrganizationEligibilityForUser` now runs across checkout confirmation, subscription activation, Stripe webhooks, admin overrides, and auth flows so organizations are provisioned or torn down automatically.
- ✅ Owner tooling live: `/dashboard/team` (built with `TeamManagementClient`, `TeamMembersList`, `TeamInviteForm`, `ProvisionRefreshButton`) calls the `/api/team/*` routes to view membership state, resend invites, revoke seats, and re-provision if anything drifts.
- ✅ Server helpers (`lib/organization-access.ts`, `lib/team-dashboard.ts`) centralize organization slugging, Clerk metadata sync, and the dashboard snapshot used by the client.
- 🚧 Documentation + wider product touchpoints (invite acceptance UX, account switchers, marketing copy) still need to catch up.

## Remaining Tracks & Owners
1. **Data & Backfill**
   - Confirm whether any legacy "team" metadata needs migration; if so, write a backfill to seed `OrganizationMembership` rows for historical customers.
   - Decide how QA/staging orgs should be seeded now that runtime provisioning is live (fixture script vs. dashboard-only setup).
2. **User Flows & Surface Area**
   - Build the invite acceptance path (deep link or in-app notification) so non-owners can join without manual admin intervention.
   - Surface organization context in shared UI (account switcher, billing summary, activity feeds) now that org metadata is synchronized with Clerk.
   - Add empty states/education in pricing + onboarding to advertise the new team dashboard.
3. **Billing & Seat Management**
   - Evaluate whether we need Stripe quantity-based pricing or internal seat audits for add/remove member flows; implement prorations if required.
   - Add automated checks that prevent owners from exceeding the seat limit configured on their plan.
4. **Testing & Rollout**
   - Add unit coverage around `ensureTeamOrganization`, invite mutations, and the `/api/team/*` routes (mock Clerk + Prisma interactions).
   - Run an end-to-end happy path: upgrade to team plan, send invite, accept invite, downgrade/expire and confirm automatic teardown.
   - Finalize launch checklist (docs, support playbook, announcement comms).

## Open Questions
- Should seat limits be enforced via Stripe subscription quantity or by internal validation + audits?
- Do we want shared token pools for enterprise tiers or keep usage PER_MEMBER for now?
- What are the requirements for an admin-only organization browser (beyond the owner dashboard) before GA?

## Next Immediate Actions
1. Finish customer-facing documentation (README, help center, release notes) so support has something to point to.
2. Implement the invite acceptance flow and wire it into the dashboard notifications banner.
3. Add regression tests around the cleanup hooks triggered when subscriptions expire.

Keeping this document current will help coordinate the remaining polish before the team rollout goes live to customers.
