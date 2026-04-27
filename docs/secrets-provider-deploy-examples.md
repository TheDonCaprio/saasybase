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
npm run secrets:doctor
npm run secrets:smoke
```

## CLI Install (Production Hosts)

Install the provider CLI directly in the environment that will run build/start.

### Infisical CLI

#### macOS

```bash
brew install infisical/get-cli/infisical
```

#### Linux

```bash
curl -1sLf "https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh" | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical
```

#### Windows (PowerShell)

```powershell
winget install Infisical.Infisical
```

### Doppler CLI

#### macOS

```bash
brew install dopplerhq/cli/doppler
```

#### Linux

```bash
curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh
```

#### Windows (PowerShell)

```powershell
winget install Doppler.Doppler
```

## Infisical Production Runbook (Machine Identity Token)

This is a concrete non-interactive production path based on Infisical Universal Auth and CLI token-based export.

1. Create a Machine Identity in Infisical and enable Universal Auth.
2. Store the identity Client ID and Client Secret in your runtime environment.
3. Exchange those credentials for an access token and export it as `INFISICAL_TOKEN`.
4. Verify `infisical export --format json` works in the same runtime context.
5. Run SaaSyBase commands in deploy order.

```bash
# machine identity credentials from Infisical Universal Auth
export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="..."
export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="..."

# choose your Infisical API URL
# US cloud: https://app.infisical.com
# EU cloud: https://eu.infisical.com
export INFISICAL_API_URL="https://app.infisical.com"

# exchange credentials for access token
export INFISICAL_TOKEN="$(curl --silent --show-error --request POST "$INFISICAL_API_URL/api/v1/auth/universal-auth/login" \
	--header 'Content-Type: application/x-www-form-urlencoded' \
	--data-urlencode "clientId=$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
	--data-urlencode "clientSecret=$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
	| node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const o=JSON.parse(s);if(!o.accessToken){process.exit(1)}process.stdout.write(o.accessToken)})")"

# explicit project/env for SaaSyBase bootstrap
export INFISICAL_PROJECT_ID="your-project-id"
export INFISICAL_ENVIRONMENT="prod"

# verify and run
infisical export --format json --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENVIRONMENT" | head -c 200
npm run secrets:doctor
npm run secrets:smoke
npm run prisma:deploy
npm run build
npm run start

# optional token renewal command
# infisical token renew <ua-access-token>
```

### Machine identity vs token (Infisical)

- Machine identity: workload identity object with role/permissions.
- Universal Auth credentials (client id + client secret): login credentials for that identity.
- Access token: short-lived token returned by login and consumed by CLI as `INFISICAL_TOKEN`.

If auth intermittently fails in production, verify your process manager injects a fresh token (or renews it) in the same runtime context where app commands execute.

## Doppler Production Runbook (Service Token)

This is the most common non-interactive production setup.

1. In Doppler, create a **Service Token** scoped to the project/config that contains your app secrets.
2. Inject that token into the runtime environment as `DOPPLER_TOKEN`.
3. Optionally set `DOPPLER_PROJECT` and `DOPPLER_CONFIG` explicitly.
4. Verify secrets can be exported in the same runtime context.
5. Run SaaSyBase commands using `doppler run -- ...` in deploy order.

```bash
# required machine credential (starts with dp.st.)
export DOPPLER_TOKEN="dp.st...."

# recommended explicit scope
export DOPPLER_PROJECT="saasybase"
export DOPPLER_CONFIG="prd"

# verify this shell can resolve secrets
doppler secrets download --no-file --format json | head -c 200

# run app commands with Doppler env injection
doppler run -- npm run secrets:doctor
doppler run -- npm run secrets:smoke
doppler run -- npm run prisma:deploy
doppler run -- npm run build
doppler run -- npm run start
```

### Service token vs service account (Doppler)

- Service account: identity object with permissions in Doppler.
- Service token: credential minted from that identity and used by CLI/runtime.
- SaaSyBase runtime uses the service token (`DOPPLER_TOKEN`), not a service-account id.

If you can run `doppler run -- npm run build` manually but deploy/runtime fails, the token is probably only in your interactive shell and not injected into systemd/platform/CI env settings.

## Safety Notes

- Never commit `DOPPLER_TOKEN`.
- Never paste real tokens into logs, screenshots, tickets, or docs.
- Rotate immediately if a token was exposed.

## Vercel

Recommended default: use Vercel encrypted env vars directly.

If you want centralized secrets instead, use Infisical or Doppler and authenticate the provider CLI in the build/runtime environment.

## Coolify

Recommended default: use Coolify application secrets/env vars directly.

If your team already standardized on Infisical or Doppler, use the same envs shown above and make sure the corresponding CLI is available in the build/runtime image.

Recommended commands:

- pre-deploy migration hook: `npm run prisma:deploy`
- build: `npm run build`
- start: `npm run start`
- validation before cutover: `npm run secrets:doctor` and `npm run secrets:smoke`
- scheduled cron caller: `Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>` (the route also accepts `CRON_SECRET` and `CRON_TOKEN`)

## Self-Hosted Linux VPS

Recommended default: use a locked-down environment file and systemd.

If you want centralized bootstrap instead, install and authenticate the provider CLI for the app user, then use the same Infisical or Doppler envs shown above.

## Rotation Workflow

1. Rotate the secret in your provider or platform env settings.
2. Run `npm run secrets:smoke` against the target environment.
3. Deploy normally.
4. Verify health, cron, webhooks, and auth.
5. Revoke old provider credentials only after the new deploy is confirmed.