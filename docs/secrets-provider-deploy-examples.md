# Secrets Provider Deploy Examples

Date: 2026-04-23

This is the copy-paste companion to the app docs page at `/docs/secrets`.

Use this mental model:

- local development: use `.env.local`
- staging and production: prefer platform-native encrypted env vars first
- centralized secret management across platforms: opt into Infisical or Doppler bootstrap

The app already knows how to do this. When enabled, the built-in loader resolves missing secrets from the selected provider before `build`, `start`, and Prisma commands run.

## Start Here

### Platform-native envs only

```bash
NEXT_PUBLIC_APP_URL=https://yourdomain.com
AUTH_PROVIDER=clerk
PAYMENT_PROVIDER=stripe
DATABASE_URL=postgresql://...
ENCRYPTION_SECRET=...
CLERK_SECRET_KEY=...
STRIPE_SECRET_KEY=...
```

### Infisical bootstrap

```bash
SECRETS_PROVIDER=infisical
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=production
NEXT_PUBLIC_APP_URL=https://yourdomain.com
AUTH_PROVIDER=clerk
PAYMENT_PROVIDER=stripe
```

### Doppler bootstrap

```bash
SECRETS_PROVIDER=doppler
DOPPLER_PROJECT=saasybase
DOPPLER_CONFIG=prd
NEXT_PUBLIC_APP_URL=https://yourdomain.com
AUTH_PROVIDER=clerk
PAYMENT_PROVIDER=stripe
```

Before the first real deploy, run:

```bash
npm run secrets:smoke
```

## Vercel

Recommended default: use Vercel encrypted env vars directly.

If you want centralized secrets instead, use Infisical or Doppler and authenticate the provider CLI in the build/runtime environment.

## Coolify

Recommended default: use Coolify application secrets/env vars directly.

If your team already standardized on Infisical or Doppler, use the same envs shown above and make sure the corresponding CLI is available in the build/runtime image.

Recommended commands:

- build: `npm run build`
- start: `npm run start`
- pre-deploy: `npm run prisma:deploy`
- validation before cutover: `npm run secrets:smoke`

## Self-Hosted Linux VPS

Recommended default: use a locked-down environment file and systemd.

If you want centralized bootstrap instead, install and authenticate the provider CLI for the app user, then use the same Infisical or Doppler envs shown above.

## Rotation Workflow

1. Rotate the secret in your provider or platform env settings.
2. Run `npm run secrets:smoke` against the target environment.
3. Deploy normally.
4. Verify health, cron, webhooks, and auth.
5. Revoke old provider credentials only after the new deploy is confirmed.