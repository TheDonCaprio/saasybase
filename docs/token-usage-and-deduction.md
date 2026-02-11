# Token usage & deduction (integration guide)

This app tracks three token buckets:

- **Paid tokens**: stored on `User.tokenBalance`.
- **Free tokens**: stored on `User.freeTokenBalance` and managed by the free-plan settings + reset jobs.
- **Shared/workspace tokens**: stored on `Organization.tokenBalance` (and related membership cap fields).

## Read the current token state (recommended)

Use the authenticated profile endpoint:

- `GET /api/user/profile`
  - Requires Clerk session.
  - Returns the current user plus a structured token breakdown:
    - `paidTokens.remaining`
    - `freeTokens.remaining`
    - `sharedTokens.remaining` (when the user is covered by a workspace plan)
    - `planSource` (`PERSONAL | ORGANIZATION | FREE`)

This is the canonical endpoint for client apps to *display* balances and decide what UI to show.

## Read token reset policy flags

Use the public settings endpoint:

- `GET /api/settings/tokens`
  - No auth.
  - Returns `{ ok: true, oneTimeRenewalResetsTokens: boolean }`.

This is primarily a UI hint (e.g. whether a one-time renewal should be explained as "resetting" tokens).

## How token deduction works today

There is currently **no public user-scoped API** like `POST /api/tokens/spend`.

Token balances change through these mechanisms:

1. **Billing/subscription flows** grant or reset tokens (server-side payment code updates balances).
2. **Admin operations** can credit/debit paid tokens via:
   - `PATCH /api/admin/users/[userId]` with `action=adjustTokens` and a positive/negative `amount`.
   - This requires an authenticated **admin/moderator** session (not suitable for a client-side integration).

If you are building a separate backend/service that needs to deduct tokens, the secure pattern is:

- Perform token deduction **server-side**, not from the browser/mobile app.
- Make the decrement **atomic** (transaction) and return a deterministic error when funds are insufficient.

### Internal spend endpoint (implemented)

An internal, server-to-server spend endpoint is available:

- `POST /api/internal/spend-tokens`

Authentication:

- Production: `Authorization: Bearer <INTERNAL_API_TOKEN>`
- Non-prod: either `X-Internal-API: true` (dev convenience) or the same Bearer token

Body:

```json
{
  "userId": "...",
  "amount": 10,
  "bucket": "auto",
  "feature": "image_export",
  "organizationId": "optional",
  "requestId": "optional"
}
```

Notes:

- Spending is **atomic** per bucket (conditional decrement inside a DB transaction).
- On insufficient funds it returns `409` with `{ error: "insufficient_tokens", required, available }`.
- `bucket=auto` uses: personal subscription → `paid`, else workspace membership → `shared`, else `free`.

### Suggested implementation (if you want a stable public spend endpoint)

If you later need a user-facing “spend tokens” API, do not expose token decrements directly from the browser/mobile app.

Recommended pattern:

- Keep decrements server-side (your backend → `POST /api/internal/spend-tokens`).
- Use Clerk-authenticated endpoints only for *reading* balances / entitlements in the client.
- Add idempotency at the caller layer if you need exactly-once semantics (the internal spend endpoint supports `requestId` for audit labeling, not idempotency).
