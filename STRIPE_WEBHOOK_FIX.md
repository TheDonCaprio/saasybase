# Stripe Webhook Configuration Issue - Missing Notifications

## Problem
Purchase notifications (user and admin) are not being sent because Stripe is sending `payment_intent.succeeded` events instead of `checkout.session.completed` events.

## Root Cause
The application's `PaymentService` is configured to handle:
- ✅ `checkout.session.completed` → triggers purchase notifications
- ✅ `invoice.payment_succeeded` → triggers renewal notifications  
- ✅ `customer.subscription.updated` → updates subscription status
- ❌ `payment_intent.succeeded` → **no handler, no notifications**

## Solution
Configure your Stripe webhook endpoint to listen for `checkout.session.completed` events:

### Option 1: Stripe Dashboard (for production)
1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click on your webhook endpoint
3. Click "Add events" or "Update events"
4. Ensure these events are selected:
   - ✅ `checkout.session.completed` (CRITICAL for purchase notifications)
   - ✅ `invoice.payment_succeeded` (for recurring renewals)
   - ✅ `customer.subscription.updated` (for subscription changes)
5. Save changes

### Option 2: Stripe CLI (for local development)
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --events checkout.session.completed,invoice.payment_succeeded,customer.subscription.updated
```

## Verification
After configuring, make a test purchase and check logs for:
```
[INFO] Webhook event constructed successfully | eventType: "checkout.completed"
[INFO] sendSubscriptionNotifications called
[INFO] Sending user billing notification
[INFO] Sending admin notification email
```

## Current Behavior (Before Fix)
```
[INFO] Webhook processed successfully | eventType: "payment_intent.succeeded"
[WARN] Received payment.succeeded event but no handler configured
```

## Expected Behavior (After Fix)
```
[INFO] Webhook processed successfully | eventType: "checkout.completed"
[INFO] sendSubscriptionNotifications called
[INFO] User billing notification result | emailSent: true
[INFO] Admin notification email sent successfully
```
