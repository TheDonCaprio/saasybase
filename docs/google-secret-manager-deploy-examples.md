# Google Secret Manager Deploy Examples

Date: 2026-04-21

This is the copy-paste companion to the app docs page at `/docs/google-secret-manager`.

If you are new to this, follow this mental model:

- local development: use `.env.local`
- staging and production: store server-side secrets in Google Secret Manager
- normal non-secret config: keep in regular env vars

The app already knows how to do this. When enabled, the built-in loader resolves missing secrets from Google Secret Manager before `build`, `start`, and Prisma commands run.

## Start Here

Use this shared base configuration in your deployment target:

```bash
GOOGLE_SECRET_MANAGER_ENABLED=true
GOOGLE_SECRET_MANAGER_PROJECT_ID=your-gcp-project-id
GOOGLE_SECRET_MANAGER_ENV=production
GOOGLE_SECRET_MANAGER_PREFIX=saasybase
```

Default secret naming pattern:

```text
saasybase-<environment>-<ENV_VAR_NAME>
```

Examples:

- `saasybase-staging-DATABASE_URL`
- `saasybase-staging-ENCRYPTION_SECRET`
- `saasybase-production-STRIPE_SECRET_KEY`

Before the first real deploy, run:

```bash
npm run secrets:smoke
```

## What Should Go Into Google Secret Manager?

Put these in Google Secret Manager:

- `DATABASE_URL`
- `ENCRYPTION_SECRET`
- `INTERNAL_API_TOKEN`
- `HEALTHCHECK_TOKEN`
- `CRON_PROCESS_EXPIRY_TOKEN` or `CRON_SECRET`
- auth provider secrets
- payment provider secret keys
- webhook secrets
- email provider secrets

Keep these as normal env vars:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_DOMAIN`
- `NEXT_PUBLIC_SITE_NAME`
- `AUTH_PROVIDER`
- `PAYMENT_PROVIDER`
- branding and public config

## Vercel

Use this when you want the fastest hosted setup.

Vercel usually needs explicit Google credentials, so the common path is a base64-encoded service account JSON stored as an encrypted Vercel env var.

```bash
GOOGLE_SECRET_MANAGER_ENABLED=true
GOOGLE_SECRET_MANAGER_PROJECT_ID=your-gcp-project-id
GOOGLE_SECRET_MANAGER_ENV=production
GOOGLE_SECRET_MANAGER_PREFIX=saasybase
GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON_B64=<base64-of-service-account-json>
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_APP_DOMAIN=yourdomain.com
AUTH_PROVIDER=clerk
PAYMENT_PROVIDER=stripe
```

Recommended flow:

1. Keep the build command as `npm run build`.
2. Run `npm run prisma:deploy` from CI or a release step.
3. Run `npm run secrets:smoke` in a preview or release pipeline before promotion.

## GitHub Actions

Use this when you deploy from CI and want the cleanest security model.

GitHub Actions can use Google workload identity federation, which is better than storing a long-lived JSON key.

```yaml
name: Deploy

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/123456789/locations/global/workloadIdentityPools/github/providers/saasybase
          service_account: saasybase-deployer@your-gcp-project-id.iam.gserviceaccount.com

      - name: Smoke test staging
        env:
          GOOGLE_SECRET_MANAGER_ENABLED: 'true'
          GOOGLE_SECRET_MANAGER_PROJECT_ID: your-gcp-project-id
          GOOGLE_SECRET_MANAGER_ENV: staging
          GOOGLE_SECRET_MANAGER_PREFIX: saasybase
          NEXT_PUBLIC_APP_URL: https://staging.example.com
          AUTH_PROVIDER: clerk
          PAYMENT_PROVIDER: stripe
        run: npm run secrets:smoke

      - name: Apply migrations
        env:
          GOOGLE_SECRET_MANAGER_ENABLED: 'true'
          GOOGLE_SECRET_MANAGER_PROJECT_ID: your-gcp-project-id
          GOOGLE_SECRET_MANAGER_ENV: production
          GOOGLE_SECRET_MANAGER_PREFIX: saasybase
          NEXT_PUBLIC_APP_URL: https://yourdomain.com
          AUTH_PROVIDER: clerk
          PAYMENT_PROVIDER: stripe
        run: npm run prisma:deploy

      - name: Build
        env:
          GOOGLE_SECRET_MANAGER_ENABLED: 'true'
          GOOGLE_SECRET_MANAGER_PROJECT_ID: your-gcp-project-id
          GOOGLE_SECRET_MANAGER_ENV: production
          GOOGLE_SECRET_MANAGER_PREFIX: saasybase
          NEXT_PUBLIC_APP_URL: https://yourdomain.com
          AUTH_PROVIDER: clerk
          PAYMENT_PROVIDER: stripe
        run: npm run build
```

## Coolify

Use this when you want a self-hosted panel instead of raw server management.

Coolify works with either:

- `GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON_B64`
- `GOOGLE_APPLICATION_CREDENTIALS` pointing at a mounted credentials file

Example env setup:

```bash
GOOGLE_SECRET_MANAGER_ENABLED=true
GOOGLE_SECRET_MANAGER_PROJECT_ID=your-gcp-project-id
GOOGLE_SECRET_MANAGER_ENV=production
GOOGLE_SECRET_MANAGER_PREFIX=saasybase
GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON_B64=<coolify-secret>
NEXT_PUBLIC_APP_URL=https://yourdomain.com
AUTH_PROVIDER=clerk
PAYMENT_PROVIDER=stripe
```

Recommended Coolify commands:

- build: `npm run build`
- start: `npm run start`
- pre-deploy: `npm run prisma:deploy`
- validation before cutover: `npm run secrets:smoke`

## Self-Hosted Linux VPS

Use this when you control the server directly.

Recommended shape:

1. Put Google credentials in a locked-down file.
2. Put non-secret app config in `/etc/saasybase/app.env`.
3. Run `npm run secrets:smoke` and `npm run prisma:deploy` before startup.

Example setup:

```bash
sudo install -o appuser -g appuser -m 700 -d /etc/saasybase
sudo install -o appuser -g appuser -m 600 gcp-service-account.json /etc/saasybase/gcp-service-account.json
sudo install -o appuser -g appuser -m 600 /dev/null /etc/saasybase/app.env
```

Example `/etc/saasybase/app.env`:

```bash
GOOGLE_SECRET_MANAGER_ENABLED=true
GOOGLE_SECRET_MANAGER_PROJECT_ID=your-gcp-project-id
GOOGLE_SECRET_MANAGER_ENV=production
GOOGLE_SECRET_MANAGER_PREFIX=saasybase
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_APP_DOMAIN=yourdomain.com
AUTH_PROVIDER=clerk
PAYMENT_PROVIDER=stripe
```

Example systemd unit:

```ini
[Unit]
Description=SaaSyBase
After=network.target

[Service]
User=appuser
Group=appuser
WorkingDirectory=/var/www/saasybase
EnvironmentFile=/etc/saasybase/app.env
Environment=GOOGLE_APPLICATION_CREDENTIALS=/etc/saasybase/gcp-service-account.json
ExecStartPre=/usr/bin/npm run secrets:smoke
ExecStartPre=/usr/bin/npm run prisma:deploy
ExecStart=/usr/bin/npm run start
Restart=always

[Install]
WantedBy=multi-user.target
```

## Rotation Workflow

Use this same order on any platform:

1. Create a new secret version in Google Secret Manager.
2. Run `npm run secrets:smoke` against the target environment.
3. Deploy normally.
4. Verify health, cron, webhooks, and auth.
5. Disable the old version after cutover is confirmed.