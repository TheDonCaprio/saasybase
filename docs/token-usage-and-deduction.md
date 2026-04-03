# Token usage & deduction (integration guide)

This app tracks three token buckets:

- **Paid tokens**: stored on `User.tokenBalance`.
- **Free tokens**: stored on `User.freeTokenBalance` and managed by the free-plan settings + reset jobs.
- **Shared/workspace tokens**: stored on `Organization.tokenBalance` (and related membership cap fields).

## Deduct tokens

There are two primary ways to deduct tokens from the application:

### 1. User-scoped spend endpoint

Use the authenticated spend-tokens endpoint for client-side integrations (e.g. your front-end calling SaaSyBase to deduct before performing an action):

- `POST /api/user/spend-tokens`
- **Authentication**: Requires a valid user session (NextAuth or Clerk).
- **Rate limiting**: Enforced per user (API_GENERAL tier).

**Body**:
```json
{
  "amount": 10,
  "bucket": "auto",           // 'auto' (default) | 'paid' | 'free' | 'shared'
  "feature": "image_export",  // Optional label for usage logs
  "organizationId": "...",    // Optional: explicit org to spend from if bucket=shared
  "requestId": "..."          // Optional label for audit tracking
}
```

**Responses**:
- `200 OK`: `{ ok: true, bucket, balances: { paid, free, sharedPool } }`
- `409 Conflict`: `{ ok: false, error: "insufficient_tokens", bucket, required, available }`
- `401 Unauthorized`: if not logged in.

**Bucket Selection Strategy (`auto`)**:
1. Check for an active personal subscription with remaining **paid tokens**.
2. If none, check for a workspace membership (if `organizationId` provided or active) with remaining **shared tokens**.
3. If none, fall back to **free tokens**.

---

### 2. Internal spend endpoint

Use the internal, server-to-server spend endpoint for secure backend integrations:

- `POST /api/internal/spend-tokens`
- **Authentication**: Requires `Authorization: Bearer <INTERNAL_API_TOKEN>`.
- **Rate limiting**: High throughput allowed.

**Body**:
```json
{
  "userId": "...",            // Target user ID
  "amount": 10,
  "bucket": "auto",
  "feature": "image_export",
  "organizationId": "...",
  "requestId": "..."
}
```

---

## Read token state

### 1. User profile endpoint
- `GET /api/user/profile`
- Returns a structured token breakdown: `paidTokens.remaining`, `freeTokens.remaining`, `sharedTokens.remaining`.

### 2. Public settings
- `GET /api/settings/tokens`
- Returns `{ ok: true, oneTimeRenewalResetsTokens: boolean }`.

---

## Implementation best practices

1. **Perform deduction server-side** if possible (using the Internal API) to avoid client-side manipulation of request amounts.
2. **Handle 409 errors** gracefully in your UI by redirecting to the `/dashboard/plan` or `/dashboard/billing` page.
3. **Use the `auto` bucket** unless you have a specific business reason to force a deduction from a specific pool (e.g. a feature that *only* uses paid credits).
4. **Leverage the `feature` label** to see granular usage reports in the admin dashboard under the "Analytics" or "Logs" sections.

