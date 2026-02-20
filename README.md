# YourApp (SaaS)

Early scaffold for the premium 3D screenshot manipulation SaaS built with Next.js 14 App Router, Clerk, Stripe, Prisma & Tailwind.

## Stack
* Next.js 14 (app router)
* Clerk auth
* Payment Provider (Stripe by default)
* Prisma + PostgreSQL
* Tailwind CSS

## Development
1. Copy `.env.example` to `.env.local` and fill values.
2. Install deps: `npm install`
3. Generate client & run migrations: `npx prisma migrate dev --name init`
4. Ensure `DATABASE_URL` points to a writable path. The default `file:./prisma/dev.db` keeps everything inside the repo for local development. When deploying to a read-only filesystem (Vercel, Netlify previews, etc.), point it at `/tmp/pro-app.db` or—preferably—a hosted Postgres instance to avoid "attempt to write a readonly database" errors during sign-in.
5. Seed plans (temporary): add a script or run `ensurePlansSeeded()` in a route / script.
6. `npm run dev`

### Setting up an Admin User

#### Development Environment (Automatic)

For local development, you can automatically assign admin privileges:

1. Set `DEV_ADMIN_ID` in `.env.local` to your Clerk user ID
2. Delete your user from the database (if already created) via `npx prisma studio`
3. Sign in again - you'll be automatically created as an admin

**⚠️ SECURITY WARNING:** This automatic method is ONLY for development:
- Disabled in production (`NODE_ENV === 'production'`)
- Environment variables can leak through logs, monitoring, CI/CD
- No audit trail of privilege escalation
- Creates single point of failure if env file is compromised

**For existing development users:**
```bash
# Promote your current user to admin
node scripts/make-admin.js <your-clerk-user-id>

# Or use DEV_ADMIN_ID from .env.local
node scripts/make-admin.js
```

#### Production Environment (Manual & Secure)

**NEVER use automatic method in production.** Instead:

**Option 1: Direct Database Access** (Most Secure)
```sql
-- Connect to your production database securely
UPDATE users SET role = 'ADMIN' WHERE id = 'user_xxxxxxxxxxxxx';
```

**Option 2: Admin Promotion Script** (Use with Caution)
```bash
# On a secure server with proper authentication
ALLOW_ADMIN_SCRIPT=true node scripts/make-admin.js user_xxxxxxxxxxxxx
```

**Script Security Considerations:**
- ⚠️ Blocked in production by default (requires `ALLOW_ADMIN_SCRIPT=true`)
- Only run on secure servers with restricted access
- Never expose as a web endpoint
- Audit who runs it and when
- Consider credential rotation after use

**Option 3: One-Time Setup Endpoint** (Advanced)
- Create temporary endpoint requiring separate secret token
- Self-destructs after first use
- Logs all attempts

💡 **Find your Clerk user ID** in the URL when signed in: `/dashboard?userId=user_xxxxx`

### Plan recurring interval

Admin plans support `recurringInterval` + `recurringIntervalCount` when `autoRenew` is enabled.

- `recurringInterval`: the unit (`day`, `week`, `month`, `year`).
- `recurringIntervalCount`: cadence multiplier (“every N units”), e.g. `month` + `2` means billed every 2 months. This is not the number of renewals/charges; users will keep being charged until they cancel.
- Razorpay constraint: daily subscriptions require `recurringIntervalCount >= 7`. We do not force this globally for other providers; when a plan is daily with a lower count, Razorpay price creation is skipped with a warning while other providers are still created.

- The admin UI shows an "Interval" select and "Every" field when creating/editing a plan. Use them to control the provider recurring price cadence for auto-created prices.

## Team Plans & Organizations

Team subscriptions provision managed organizations automatically and keep them in sync with billing status.

- **Stripe setup:** Add `TEAM_SUBSCRIPTION_PRICE_*` IDs (for example `TEAM_SUBSCRIPTION_PRICE_1M`) to `.env.local` / production. Each price should point at the Stripe subscription tier that unlocks team access.
- **Provisioning flow:** When a qualifying subscription activates, `ensureTeamOrganization` creates or updates an organization for the owner, assigns a deterministic slug, and mirrors metadata back to Clerk so client components know which org to load.
- **Automatic cleanup:** `syncOrganizationEligibilityForUser` now runs anywhere subscription status changes (checkout confirm, activation, Stripe webhook, admin overrides). When a plan lapses the helper tears down the organization, removes members, and clears Clerk metadata so stale teams do not linger.
- **Owner dashboard:** `/dashboard/team` hosts the management UI (`TeamManagementClient`) with invites, member removal, and provisioning refresh. The page calls `/api/team/*` routes to keep Prisma + Clerk in sync, so the state you see there is always the source of truth.
- **Invites & membership state:** New API handlers (`/api/team/invite`, `/invite/revoke`, `/members/remove`, `/summary`, `/provision`) expose all day-to-day operations. Client-side hooks call them after every mutation and refetch the latest snapshot using `fetchTeamDashboardState`.

### Stripe price environment variables

- One-time plans must point to env vars prefixed with `PAYMENT_PRICE_` (for example `PAYMENT_PRICE_24H`).
- Recurring plans must use `SUBSCRIPTION_PRICE_` (for example `SUBSCRIPTION_PRICE_1M`).
- Legacy `PRICE_*` keys still work as a fallback, but the runtime logs a warning and the validator flags them—rename to the new contract when you can.
- The checkout flow now verifies that the Stripe price type matches the plan mode, so mismatched IDs fail fast with a helpful error instead of a cryptic Stripe message.
- To have the admin automatically create Stripe price IDs for you, set `STRIPE_AUTO_CREATE=1` in `.env.local` (keep `STRIPE_SECRET_KEY` populated). The first time you save a plan without a `stripePriceId`, the app will create the product/price in Stripe and write the generated ID back into the matching `PAYMENT_PRICE_*`/`SUBSCRIPTION_PRICE_*` entry in your env file. Leave the placeholder values from `.env.example` in place—they will be replaced automatically.

## Paystack setup

- Switch provider: set `PAYMENT_PROVIDER=paystack` in `.env.local` (defaults to Stripe).
- Required env vars:
   - `PAYSTACK_SECRET_KEY` (server key)
   - `PAYSTACK_WEBHOOK_SECRET` (signing secret from Paystack; supports comma-separated rotation)
   - `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` (client inline.js)
- Webhooks: point Paystack to `/api/webhooks/paystack`. Paystack signs with your secret key; set `PAYSTACK_WEBHOOK_SECRET` or leave unset to fall back to `PAYSTACK_SECRET_KEY`.
- Scripts: loaded automatically via `PaymentProviderScripts`; no layout edits needed.
- Pricing model: Paystack uses `plan_code` as the price ID. Our `createPrice` makes a Paystack plan and returns `plan_code` as `priceId`. Subscriptions pass that code to `/transaction/initialize`; one-time payments pass the raw amount (no plan needed).
- Coupons/promo/proration: not supported by Paystack. Apply discounts in-app before creating the transaction or use separate discounted plans you create in Paystack.
- Receipts: Paystack does not host receipts; keep using your own billing UI and receipts.
- Manage payment method (subscriptions): Paystack supports a hosted subscription management page (update card / cancel) via `GET /subscription/:code/manage/link`.
   - The app uses this for the "Manage payment" button when the user's active billing provider is Paystack and they have an active Paystack subscription (`SUB_...`).
   - For one-time Paystack payments, there is no customer portal equivalent.

### Recommended Paystack webhook events

Subscribe your Paystack webhook to:

- `charge.success` (required)
- `subscription.create` (recommended)
- `subscription.not_renew` (recommended; fires when a subscription is set to cancel at period end)
- `subscription.disable` (recommended; fires when a subscription is cancelled immediately)
- `invoice.create` (recommended; used internally for cancel-at-period-end workaround)
- `invoice.update` (recommended)
- `invoice.payment_failed` (recommended)
- `refund.processed` (recommended; used to sync refunds)

Notes:

- `refund.pending` is intentionally treated as a no-op in this app to avoid marking payments as refunded before Paystack finalizes the refund.
- Paystack does not use a standalone webhook secret. It signs webhook payloads with your **API Secret Key** (`PAYSTACK_SECRET_KEY`). If `PAYSTACK_WEBHOOK_SECRET` is set it will be used, otherwise the app falls back to `PAYSTACK_SECRET_KEY` automatically.

## Paddle setup

- Switch provider: set `PAYMENT_PROVIDER=paddle` in `.env.local`.
- Required env vars:
   - `PADDLE_API_KEY` (server API key)
   - `PADDLE_WEBHOOK_SECRET` (notification destination endpoint secret key; supports comma-separated rotation)
    - `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (Paddle.js client-side token; used by the default payment link page)
   - Optional: `PADDLE_ENV=sandbox` (or `PADDLE_SANDBOX=1`) and/or `PADDLE_API_BASE_URL` (advanced)
- Webhooks: point Paddle notification destination to `/api/webhooks/payments` (centralized multi-provider ingress).
   - `/api/webhooks/paddle` also works, but `/api/webhooks/payments` is preferred.

### Default payment link (required)

Paddle Billing requires a **Default payment link** to generate `transaction.checkout.url`. This is **not** an API route.

- The app provides a ready-made default payment link page at: `/paddle/pay`.
- Set your Paddle Dashboard setting to:
   - **Default payment link** = `https://YOUR_DOMAIN/paddle/pay`
- The resulting checkout URLs will look like:
   - `https://YOUR_DOMAIN/paddle/pay?_ptxn=txn_...`

Important notes:

- The default payment link page must be hosted on an **approved website** in Paddle (Paddle → Checkout → Website approval). For sandbox, approval is typically instant, but you still need to add the domain.
- The page uses Paddle.js and needs `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` configured (do not use random characters).

Local development:

- Paddle generally requires HTTPS + an approved domain. Use an HTTPS tunnel (ngrok) and set the Default payment link to:
   - `https://YOUR_NGROK_DOMAIN/paddle/pay`

### Redirect-only limitation

This Paddle integration is **redirect-only** and uses the transaction payment link (`checkout.url`) that points at your Default payment link page. It does not implement a Stripe-like `success_url`/`cancel_url` checkout session. Treat **webhooks as the source of truth** for granting access and updating subscription state.

### Recommended Paddle webhook events

Subscribe the notification destination to:

- `transaction.completed` (required)
- `subscription.created` (recommended)
- `subscription.updated` (recommended)
- `transaction.payment_failed` (optional)
- `adjustment.created` (recommended; refunds that are auto-approved)
- `adjustment.updated` (recommended; refunds that require approval)

These are the only Paddle `event_type` values currently normalized by the server; other Paddle events are treated as no-ops.

### Price IDs

Paddle checkouts require **catalog price IDs** (`pri_...`). Ensure your `PAYMENT_PRICE_*` / `SUBSCRIPTION_PRICE_*` env vars contain Paddle IDs when `PAYMENT_PROVIDER=paddle`.

### Admin config check

If checkout fails with a generic Paddle overlay error, use the admin config endpoint to detect common misconfiguration:

- `GET /api/admin/billing/paddle-config`

This performs a safe API ping and a checkout probe to detect missing Default payment link, missing Paddle prices, and invalid credentials.

### Billing portal / manage payment

- The app's "Manage payment" button creates a Paddle customer portal session via `POST /customers/{ctm_...}/portal-sessions`.
- Paddle validates this endpoint strictly; the session request is sent with an empty JSON body and uses your Paddle portal configuration.

## Razorpay setup

- Switch provider: set `PAYMENT_PROVIDER=razorpay` in `.env.local`.
- Required env vars:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET` (signing secret configured in Razorpay dashboard)
- Optional env vars:
   - `RAZORPAY_ENABLE_OFFERS=true` (opt-in; allows attaching `offer_id` to one-time Payment Links)
- Webhooks: point Razorpay to `/api/webhooks/payments` (centralized multi-provider ingress).
- Signature header: Razorpay signs requests with `x-razorpay-signature`.

### Recommended Razorpay webhook events

Enable these webhook events in Razorpay (these are the ones the server currently normalizes):

- `payment_link.paid` (required; one-time payments via Payment Links)
- `refund.processed` (recommended; refund sync)
- `payment.refunded` (recommended; alternative refund event)
- `payment.captured` (recommended; subscription renewals and one-time payment confirmation)
- `payment.failed` (recommended; failed payment notifications)

If you are using Razorpay Subscriptions, also enable the **Subscription** events (these only appear in the dashboard once Subscriptions are enabled on your account):

- `subscription.activated` (required; initial activation)
- `subscription.updated` (required; plan changes, status changes, scheduled cancellations)
- `subscription.cancelled` (required; immediate cancellation sync)
- `subscription.halted` (recommended; fires when payment retries are exhausted)

Notes:

- The app treats webhooks as the source of truth for granting access and updating subscription status.
- If you do not see any `subscription.*` events in Razorpay, then Razorpay Subscriptions webhooks are not available for your account yet, and **subscription mode will not be able to auto-activate from webhooks** with the current implementation.
- Razorpay checkouts are redirect-based in this repo:
   - One-time payments use Payment Links (`/v1/payment_links`) and redirect to the returned `short_url`.
   - Subscriptions use Subscriptions (`/v1/subscriptions`) and redirect to the returned `short_url`.

### Manage payment / subscription

- Razorpay does not have a Stripe-style customer portal session API.
- The app’s “Manage payment” button uses the active Razorpay subscription’s hosted `short_url` as a best-effort management page.
   - This is subscription-scoped (not customer-scoped). If the user has no active Razorpay subscription, the button shows an error.

### Optional: Razorpay Offers ↔ app coupons (one-time only)

Razorpay “Offers” are not the same as Stripe-style coupon/promo codes (they can be bank/issuer/EMI dependent, and may not behave like a deterministic percent/amount discount).

If you still want to link a specific app coupon code to a Razorpay Offer for **one-time** checkouts:

- Set `RAZORPAY_ENABLE_OFFERS=true`.
- Put an offer id token in the coupon’s `description` field (anywhere), e.g.:
   - `razorpayOfferId=offer_ABC123`
   - `razorpay_offer: offer_ABC123`
   - `rzp_offer=offer_ABC123`

Notes:

- This is only used for one-time Razorpay Payment Links. Subscription discounts are not supported by this mapping.
- If Razorpay rejects `offer_id` as an unsupported field, the server retries checkout without the offer.

## Multi-Provider Payment Architecture

The app supports multiple payment providers through a provider-agnostic architecture. This section explains the key concepts and setup requirements.

### Provider Selection

- Set `PAYMENT_PROVIDER` environment variable to choose your active provider (`stripe`, `paystack`, `paddle`, or `razorpay`)
- The system automatically routes new transactions to the active provider
- Existing transactions are handled by their original provider (stored in `paymentProvider` field)

Archived providers:

- **Lemon Squeezy**: the implementation is kept for reference/tests in `lib/payment/providers/lemonsqueezy.ts`, but it is not registered as a selectable provider and is not routed by the centralized webhook/checkout handlers.

### Required Environment Variables by Provider

**Stripe:**
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Stripe customer portal (for "Manage payment"):

- Enable Stripe's Customer Portal in Stripe Dashboard → Settings → Billing → Customer portal.
- If the app returns "Billing portal not configured", this is the first thing to check.

**Paystack:**
```bash
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_WEBHOOK_SECRET=... # Optional, falls back to PAYSTACK_SECRET_KEY
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_...
```

**Paddle:**
```bash
PADDLE_API_KEY=pat_live_...
PADDLE_WEBHOOK_SECRET=... # Notification destination secret key
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=... # Paddle.js
```

### Provider Feature Support

Not all providers support all features. Use `supportsFeature()` to check capabilities at runtime:

| Feature | Stripe | Paystack | Paddle | Razorpay |
|---------|--------|----------|--------|---------|
| Coupons | ✅ Provider | ✅ In-app only | ✅ Provider | ✅ In-app only (offers opt-in)* |
| Proration | ✅ | ❌ | ✅ | ✅ |
| Subscription updates | ✅ | ❌ (cancel + recreate) | ✅ | ✅ |
| Cancel at period end | ✅ | ✅ (via webhook workaround) | ✅ | ✅ |
| Customer portal | ✅ | Subscriptions only (manage link) | ✅ | Subscriptions only (manage link) |
| Invoices | ✅ | ❌ | ❌ | ❌ |
| Receipts | ✅ | ❌ | ❌ | ❌ |
| Refunds | ✅ | ✅ | ✅ | ✅ |
| Disputes | ✅ | ❌ | ❌ | ❌ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| Elements/Inline | ✅ | ✅ | ❌ | ❌ |
| Trial periods | ✅ | ❌ | ❌ | ❌ |

\* Razorpay does not support Stripe-style coupons in this app. Coupons/discounts are handled in-app. There is an optional one-time-only integration that can attach a Razorpay `offer_id` to Payment Links when `RAZORPAY_ENABLE_OFFERS=true`.

### Database Schema for Multi-Provider

The database uses dual-column patterns for backward compatibility:

- **Legacy columns** (e.g., `stripeSubscriptionId`, `stripePriceId`) - kept for existing Stripe data
- **Generic columns** (e.g., `externalSubscriptionId`, `paymentProvider`) - used for new transactions
- **Provider ID maps** (e.g., `externalSubscriptionIds` as JSON) - for future multi-provider per-record support

When querying, always check both legacy and generic columns:
```typescript
const subscription = await prisma.subscription.findFirst({
  where: {
    OR: [
      { externalSubscriptionId: providerId },
      { stripeSubscriptionId: providerId }
    ]
  }
});
```

### Coupon Currency Validation

Coupons with `amountOffCents` must specify a `currency` field. The checkout flow validates that:
- Percent-off coupons work with any currency
- Amount-off coupons only apply when currencies match

### Cancel at Period End (Paystack Workaround)

Paystack doesn't support native cancel-at-period-end. The system implements a workaround:

1. When canceling with `immediately=false`, we set `cancelAtPeriodEnd=true` in our database
2. When `invoice.created` webhook fires, we check if subscription is marked for cancellation
3. If marked, we immediately cancel in Paystack before the charge goes through

### Dispute/Chargeback Handling

For Stripe, the system handles disputes automatically:
- `dispute.created`: Marks payment as `DISPUTED`, notifies admins
- `dispute.updated`/`dispute.closed`: Updates status based on outcome (`won` → `SUCCEEDED`, `lost` → `REFUNDED`)

### Adding New Payment Providers

See [docs/adding-payment-providers.md](docs/adding-payment-providers.md) for a complete guide on implementing new payment gateways.

## Feature Gating
`lib/features.ts` enumerates all pro features. Use `<FeatureGate feature={FeatureId.X}>...</FeatureGate>`.

## Organization Expiry Automation

To ensure that organizations are automatically dismantled when a team subscription expires, we use a dual approach: a Cron Job for scheduled cleanup and a "Lazy Check" for immediate enforcement.

### Cron Job Setup (Recommended)

The application exposes a public API endpoint that should be triggered periodically (e.g., hourly or daily) to clean up expired subscriptions and "zombie" organizations.

1.  **Configure the Job**: Use your hosting provider's cron scheduler (like Vercel Cron or cPanel Cron) or an external service to make a `GET` request to:
    `https://yourdomain.com/api/cron/process-expiry`
2.  **Security (Required in production)**: Configure a token and send it as a Bearer header.

   - Set `CRON_PROCESS_EXPIRY_TOKEN` (preferred) or `INTERNAL_API_TOKEN`.
   - Call the endpoint with: `Authorization: Bearer <token>`

   In production, unauthorized requests return `404`.

#### Example cron commands (cPanel-friendly)

In cPanel → **Cron Jobs**, you paste a shell command. You do not need SSH.

- Using `curl` (recommended):

   ```bash
   curl -fsS -m 60 \
      -H 'Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>' \
      'https://yourdomain.com/api/cron/process-expiry' \
      >/dev/null 2>&1
   ```

- Using `wget` (if `curl` is unavailable):

   ```bash
   wget -qO- --timeout=60 \
      --header='Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>' \
      'https://yourdomain.com/api/cron/process-expiry' \
      >/dev/null 2>&1
   ```

Optional logging (useful for debugging; keep the token out of logs):

```bash
curl -fsS -m 60 \
   -H 'Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>' \
   'https://yourdomain.com/api/cron/process-expiry' \
   >> /home/<cpanel-user>/cron-process-expiry.log 2>&1
```

### Lazy Expiry Check

As a fallback, the application also performs a lightweight check when users visit the dashboard. If a user is found to be part of an invalid organization (where the owner's subscription has expired), the organization is automatically dismantled to prevent unauthorized access.

## Webhooks
Configure Stripe endpoint: `/api/stripe/webhook` with signing secret (the app exposes the route at `app/api/stripe/webhook`).

When a subscription is created or an invoice payment succeeds, the webhook uses Stripe's `subscription.current_period_end` to set `Subscription.expiresAt` in the database. This keeps your app's expiry aligned with Stripe's billing cycle and avoids month/day drift.

To test locally:

- Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and set `STRIPE_WEBHOOK_SECRET` from the output.
- Create checkout sessions in test mode and observe `Subscription` and `Payment` rows being created/updated.

## Production Setup

### Stripe Webhook Configuration (Critical)

For notifications and emails to work in production, you must configure webhooks in the Stripe Dashboard.

Endpoints and secrets

1. **Go to Stripe Dashboard → Developers → Webhooks**
2. **Click "Add endpoint"**
3. **Set endpoint URL:** `https://yourproductiondomain.com/api/stripe/webhook` (preferred)

Optional legacy endpoint

- The codebase also exposes a legacy-compatible path at `app/api/webhooks/stripe/route.ts` (runtime URL `/api/webhooks/stripe`). If you have an existing webhook configured at that path, you can continue to use it, but prefer ` /api/stripe/webhook` for new setups.

Secrets: the app supports multiple comma-separated webhook signing secrets in `STRIPE_WEBHOOK_SECRET` (useful during secret rotation or when forwarding multiple Stripe endpoints to the same app). Example:

```bash
STRIPE_WEBHOOK_SECRET="whsec_livesecret1,whsec_rotatedsecret2"
```

Select events to listen to

Subscribe the endpoint to the following events (recommended for full billing coverage):

   - `checkout.session.completed` — Completed checkout sessions (one-off purchases and initial subscription checkouts).
   - `checkout.session.async_payment_succeeded` — Async checkout success (bank redirects). The server normalizes this to `checkout.completed`.
   - `checkout.session.async_payment_failed` — Async checkout failure (treated as a payment failure).
   - `invoice.payment_succeeded` — Successful invoice payments (subscription renewal and one-off invoices).
   - `invoice.payment_failed` — Failed invoice payments (useful to notify users and pause or retry subscriptions).
   - `invoice.finalized` — Invoice finalized (useful if you create draft invoices server-side or need invoice metadata before payment).
      - `invoice.upcoming` — Heads-up about an upcoming invoice / renewal (optional but recommended). The app now normalizes this into a provider-agnostic `invoice.upcoming` event and will send a renewal reminder email if appropriate.
   - `customer.subscription.created` — New subscriptions (record creation and initial metadata).
   - `customer.subscription.updated` — Plan changes, trial updates, renewals or cancellations reflected on the subscription object.
   - `customer.subscription.deleted` — Cancellations or ended subscriptions (cleanup and expiry handling).
   - `payment_intent.succeeded` and `payment_intent.payment_failed` — Lower-level payment intents for additional payment flows and async payments. When a `payment_intent.succeeded` references an Invoice, the webhook handler will automatically load the Invoice and normalize it to `invoice.payment_succeeded` so renewals and recurring flows are handled consistently.
   
Recommended (concise list)

If you want a quick checklist to paste into the Stripe Dashboard when creating or updating your endpoint, enable at minimum the following events for full billing and reminder coverage:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.upcoming` (recommended)
- `payment_intent.succeeded` (optional — normalized when attached to an invoice)
- `charge.refunded` (optional — refunds)
- `charge.dispute.created` (optional — disputes)
- `charge.dispute.updated` (optional — disputes)
- `charge.dispute.closed` (optional — disputes)

Notes:
- Fewer events reduces noise; the most critical are `checkout.session.completed`, `invoice.payment_succeeded`, and `customer.subscription.*`.
- `invoice.upcoming` is useful to surface renewal reminders and is now supported by the server as a provider-agnostic event.
   - `payment_intent.requires_action` / `invoice.payment_action_required` — Payment actions required for SCA/3DS flows; surface these to your support/admins if manual intervention is needed.
   - `charge.refunded` — Refunds applied to charges (keep refund records and notify users/admins).
   - `charge.dispute.created` and `charge.dispute.closed` — Dispute lifecycle events for fraud/chargebacks.
   The app relies on several Stripe events to keep subscription, payment and refund state in sync and to trigger notifications. Only subscribe to the events you need (fewer events = less noise), but the following list is recommended for full billing coverage:

   Notes:
   - `invoice.payment_succeeded` and `customer.subscription.*` are the primary events used to update `Subscription.expiresAt` and to reconcile billing state.
   - For many setups `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, and `customer.subscription.*` are sufficient.
   - Avoid subscribing to every event unless you plan to process them — focus on the ones your app relies on.
   - The server now normalizes `checkout.session.async_payment_succeeded` to the same internal `'checkout.completed'` type and will attempt to normalize `payment_intent.succeeded` to `'invoice.payment_succeeded'` when the PaymentIntent references an Invoice (this helps handle non-invoice or async payment flows consistently).
5. **Copy the webhook signing secret** and set it in your production environment:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret_here
   ```

   Notes:
   - `invoice.payment_succeeded` and `customer.subscription.*` are the primary events used to update `Subscription.expiresAt` and to reconcile billing state.
   - For many setups `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, and `customer.subscription.*` are sufficient.
   - Avoid subscribing to every event unless you plan to process them — focus on the ones your app relies on.
5. **Copy the webhook signing secret** and set it in your production environment:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret_here
   ```

⚠️ **Important:** Without this setup, purchases and renewals will be recorded in your database, but users won't receive notifications or emails.

### Clerk Webhook Configuration (Welcome emails)

The app now relies on a server-side Clerk webhook to send welcome emails reliably (users can verify on any device and the backend will handle delivery). Configure a Clerk webhook endpoint that points to `https://yourdomain.com/api/webhooks/clerk` and set the signing secret in your environment.

1. **Go to Clerk Dashboard → Webhooks** (or the equivalent section in your Clerk account).
2. **Add endpoint** and set the URL to: `https://yourproductiondomain.com/api/webhooks/clerk`
3. **Select events to send to your endpoint:**
   - `user.created` (optional: if you want to attempt welcome flow at signup)
   - `user.updated` (recommended: watch for email/verification status changes)
4. **Copy the webhook signing secret** and set it in your production environment:
   ```bash
   CLERK_WEBHOOK_SECRET=whsec_your_clerk_webhook_secret_here
   ```

Notes:
- The webhook handler at `app/api/webhooks/clerk/route.ts` will attempt to use `@clerk/nextjs/server` (if installed) to verify signatures. In development the route will also accept unsigned events so you can test via tunnels; in production a missing or invalid signature is rejected.
- The handler checks the user's primary email verification status (via Clerk server SDK) before sending the welcome email. It also deduplicates sends using the `emailLog` table so client-side and webhook triggers are safe to coexist.
- Test locally using `ngrok` or the Stripe-like tunnel you prefer. Register the ngrok URL as the webhook endpoint and copy the signing secret into `CLERK_WEBHOOK_SECRET` in your `.env.local`.

### Additional Production Environment Variables

Ensure these are set in your production environment:
- `PAYMENT_PROVIDER` (defaults to "stripe")
- `STRIPE_SECRET_KEY` (your live Stripe secret key)
- `STRIPE_WEBHOOK_SECRET` (from the webhook configuration above)
- `HEALTHCHECK_TOKEN` (random string required to view detailed `/api/health` diagnostics; send requests with `Authorization: Bearer <token>`—you can reuse `INTERNAL_API_TOKEN` if you already have one configured)
- `SEND_ADMIN_BILLING_EMAILS=true` (if you want admin notifications)
- SMTP settings for email delivery (replace MailHog with real SMTP)
- `NEXT_PUBLIC_APP_URL` (used to build dashboard links embedded in support emails)
- `SUPPORT_EMAIL` (address that should receive support ticket notifications)
- `EMAIL_FROM` (outbound From header; defaults to `no-reply@<NEXT_PUBLIC_APP_DOMAIN>` if unset)

### Analytics (Google Analytics 4)

Traffic dashboards now pull metrics from [Google Analytics 4](https://marketingplatform.google.com/about/analytics/). Configure the following variables in `.env.local` / production to enable tracking and admin reporting:

| Variable | Required? | Scope | Example |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | ✅ | Client | `G-XXXXXXXXXX` |
| `GA_PROPERTY_ID` | ✅ | Server | `123456789` |
| `GA_SERVICE_ACCOUNT_CREDENTIALS_B64` | ✅ | Server | Base64-encoded service account JSON with `analytics.readonly` access |
| `GA_DATA_API_CACHE_SECONDS` | optional | Server | `30` (seconds)

Only production builds inject the GA4 snippet; leave the fields blank locally if you want to disable tracking. Once the environment variables are in place:

1. Open GA4 → **Admin** → **Property Access Management** (under the Property column).
2. Click **Add users**, paste the service-account email from your JSON (`...@<project>.iam.gserviceaccount.com`), and assign at least the **Viewer** role.
3. Wait a minute for permissions to propagate, then refresh the admin traffic dashboard.

The traffic dashboard now surfaces GA4 metrics for total visits, unique visitors, new users, engaged sessions, page views, average session duration, engagement rate, top referrers, events, countries, pages, and device mix. All of those derive from the Data API using the filters you select.

Granting IAM roles in Google Cloud alone is not enough—GA4 requires the email to be an explicit Property user. If the service account lacks access, the admin API will return a friendly 403 explaining what to fix. Refer to `ops/GOOGLE_ANALYTICS_MIGRATION_PLAN.md` for deeper rollout notes.

> **Heads-up:** As soon as `NEXT_PUBLIC_GA_MEASUREMENT_ID` is defined the GA snippet loads in every environment (including local development). Point the variable at a development property if you want to avoid polluting production analytics while testing locally.

### Self-hosted deployments (AlmaLinux / RHEL clones)

When you deploy on a bare-metal or VPS host running AlmaLinux, the app still reads configuration from standard Node/Next.js environment variables. You have two common options to expose `HEALTHCHECK_TOKEN` (and the rest of your secrets):

1. **Systemd service + EnvironmentFile**
   - Replace `appuser` with the Unix user that runs your app, then create an env file (for example `/etc/saasybase/pro-app.env`) with the right permissions:
      ```bash
      TOKEN=$(openssl rand -hex 32)
         sudo install -o appuser -g appuser -m 600 /dev/null /etc/saasybase/pro-app.env
         sudo tee /etc/saasybase/pro-app.env >/dev/null <<EOF
       HEALTHCHECK_TOKEN=$TOKEN
       STRIPE_SECRET_KEY=sk_live_...
       # ...other env vars...
       EOF
       ```
   - Reference it from your service unit (e.g. `/etc/systemd/system/saasybase.service`):
      ```ini
      [Service]
      EnvironmentFile=/etc/saasybase/pro-app.env
      ExecStart=/usr/bin/npm run start
      WorkingDirectory=/var/www/saasybase/pro-app
      ```
    - Reload and restart systemd to apply the secret:
       ```bash
      sudo systemctl daemon-reload
      sudo systemctl restart saasybase
       ```

2. **Dotenv file alongside the app**
   - Ship a `.env.production` (or `.env.local`) next to the built app containing:
       ```bash
       HEALTHCHECK_TOKEN=$(openssl rand -hex 32)
       ```
    - Ensure the shell that launches `npm run start` exports the variables (`set -a; source .env.production`) before starting the app.

 Both methods keep the token out of your code repo and make it easy to rotate: regenerate a new value, write it to the env file, then restart the process.

### Support Ticket Email Notifications

- Every new ticket or user reply triggers an email to `SUPPORT_EMAIL`, including direct links back to the ticket in the admin dashboard.
- Admin replies send an email to the ticket owner (unless they set the `EMAIL_NOTIFICATIONS` user setting to `false`). Those messages include a link back to their dashboard thread for quick follow-up.
- Customer-facing emails are notification-only—each one reminds them to open their support dashboard to respond, and replies sent directly via email are not ingested by the system.
- Configure SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) for production so these notifications deliver outside of local testing. Without SMTP, Nodemailer falls back to the in-memory stream transport.
- The reply author shown in the email is pulled from the responding user's name/email; encourage staff to keep their profile details up to date for clarity.

## TODO (Next)

Shipped (already implemented in this repo):

- 3D editor port in `components/tools/Editor3D.tsx`
- Admin CRUD pages for users/plans/settings/coupons (+ core admin APIs)
- Billing management dashboard (portal, invoices, cancellation flows)
- Usage tracking + persistent rate limiting helpers
- Support tickets pages (admin + user dashboard)
- Coupons + redemption flows
- Input validation (Zod) and security hardening foundations

Next:

- Expand admin CRUD to remaining surfaces (payment providers, org management UX polish, audit trails)
- Email notifications service abstraction (provider swap, retries, observability)
- Security hardening follow-ups (audit log persistence, production logging sinks, stricter env validation)

## Disclaimer
This codebase is production-oriented, but you should still review env/config, auth, and security posture for your deployment.

## S3 Logo Upload (important)

If you configure `LOGO_STORAGE=s3` to host uploaded logos in S3, the bucket needs to be accessible by the application and the public (or fronted by a CDN). In development we expect logos to be reachable via a public URL so Next.js `next/image` can load them.

Checklist when using S3 for logos:

- `LOGO_S3_BUCKET` must point to your bucket (e.g. `my-bucket-name`).
- Ensure the bucket or its objects are readable by the public (or configure a CloudFront distribution in front of the bucket).
- If you rely on object ACLs (we set `ACL: 'public-read'` in uploads), you must allow ACLs on the bucket. Newer S3 buckets may block ACLs by default and throw errors like "bucket does not allow ACLs" — if you see that, enable ACLs or configure a public read policy. See discussion: https://stackoverflow.com/questions/71080354/getting-the-bucket-does-not-allow-acls-error
- Ensure `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` are set in `.env.local` for local testing (or rely on an instance role / environment credentials in production).
- Add the S3 hostname(s) to `next.config.mjs` `images.remotePatterns` so Next/Image accepts external URLs (we already include common S3 and CloudFront patterns in the example config).

If you prefer not to make the bucket public, use CloudFront with an origin access identity or signed URLs and return CDN URLs from the upload handler.

### Use CloudFront as the public endpoint (recommended)

If you front your bucket with CloudFront (recommended), set `LOGO_CDN_DOMAIN` to your distribution domain (e.g. `dxca1h3kz76b5.cloudfront.net`). The upload handler will then return CDN-hosted URLs like `https://<LOGO_CDN_DOMAIN>/logos/<filename>` instead of raw S3 links. This keeps your S3 bucket private while CloudFront serves the images.

Example `.env.local` entry:

```
LOGO_CDN_DOMAIN=dxca1h3kz76b5.cloudfront.net
```

Note: We removed setting `ACL: public-read` on upload; CloudFront + Origin Access Identity or a bucket policy is the secure way to allow public reads.
 
### S3 CORS and CloudFront — make uploaded images editable from the browser

If you want users (or your admin UI) to upload and then edit images that are served from S3 via CloudFront, the browser needs two things to work correctly: the S3 bucket must allow cross-origin requests, and CloudFront needs to return the right CORS response headers to browsers. Follow these steps to avoid CORS errors and make image uploads/editing work from the frontend.

Step 1 — Add a CORS policy to your S3 bucket

1. Open the AWS S3 console and select the bucket that stores the uploaded images.
2. Go to the Permissions tab for that bucket.
3. Scroll to "Cross-origin resource sharing (CORS)" and click Edit.
4. Paste this JSON into the editor and save:

```json
[
   {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedOrigins": ["http://localhost:3000"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
   }
]
```

Tip: in production replace `http://localhost:3000` with your real frontend domain (for example `https://myapp.com`). This policy allows the browser to perform PUT/POST uploads and GET reads from that origin, and it exposes the `ETag` header which is useful when editing or validating objects.

Step 2 — Configure CloudFront to forward the Origin header and add CORS response headers

First, make sure your CloudFront distribution allows the HTTP methods your app needs. For editable uploads and deletes enable:

`GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`

OPTIONS is required for CORS preflight requests; the others allow reads, uploads/updates and deletes from the browser or API clients.

Option A — Recommended: use AWS managed response policy

- In your CloudFront distribution, set Response headers policy to: `CORS-With-Preflight (Managed by AWS)`.
- Set Origin request policy to: `CORS-S3Origin` so CloudFront forwards the browser's `Origin` header to S3.
- Use a cache policy like `CachingOptimized` (recommended for S3) so caching remains efficient.

Why this is easiest: the managed `CORS-With-Preflight` policy automatically adds the `Access-Control-Allow-*` headers browsers need, while `CORS-S3Origin` ensures S3 sees the original request origin when it evaluates the bucket CORS rules.

Option B — Advanced: custom policies

If you want more control, create a custom Origin Request Policy that forwards the `Origin` header and any headers you need, and add a custom Response Headers Policy to set `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers`. This works fine but is more configuration work and you must keep the allowed origins/methods consistent between S3 and CloudFront.

Troubleshooting tips

- If the browser shows CORS errors when uploading or editing images, check both the S3 bucket CORS policy and the CloudFront response headers policy — both sides must be correct.
- Keep `http://localhost:3000` in the S3 AllowedOrigins during local development. For production, use your real domain.
- The combination `CachingOptimized` (cache), `CORS-S3Origin` (origin request), and `CORS-With-Preflight` (response headers) is a simple, reliable configuration for S3 + CloudFront-backed images.
