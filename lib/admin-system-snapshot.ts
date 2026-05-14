import os from 'os';
import { getSetting, SETTING_DEFAULTS, SETTING_KEYS } from './settings';

export type AdminEnvironmentSetting = {
  key: string;
  value: string;
  description?: string;
};

export type AdminRuntimeSnapshot = {
  nodeVersion: string;
  runtime: string;
  deploymentTarget: string;
  authProvider: string;
  paymentProvider: string;
  demoMode: string;
  maintenanceMode: string;
  fileStorage: string;
  emailDelivery: string;
  platform: string;
  loadAverage: string;
  cpuCores: string;
  totalMemory: string;
  freeMemory: string;
  rssMemory: string;
  heapUsed: string;
  appUptime: string;
  hostUptime: string;
  timezone: string;
};

function isConfigured(value: string | undefined | null) {
  if (!value) return false;
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== 'xxx';
}

function resolveStorageBackend() {
  const backend = (process.env.FILE_STORAGE || process.env.LOGO_STORAGE || 'fs').toLowerCase();
  return backend === 's3' ? 'S3 Bucket' : 'Local';
}

function resolveStorageBucketStatus() {
  return isConfigured(process.env.FILE_S3_BUCKET || process.env.LOGO_S3_BUCKET) ? 'Configured' : 'Missing';
}

function resolveStorageEndpointStatus() {
  return isConfigured(process.env.FILE_S3_ENDPOINT || process.env.LOGO_S3_ENDPOINT)
    ? 'Configured'
    : 'AWS default';
}

function resolveEmailProvider() {
  return (process.env.EMAIL_PROVIDER || 'nodemailer').toLowerCase();
}

function resolveSmtpStatus() {
  return isConfigured(process.env.SMTP_HOST) && isConfigured(process.env.SMTP_PORT) ? 'Configured' : 'Missing';
}

function resolveResendStatus() {
  return isConfigured(process.env.RESEND_API_KEY) ? 'Configured' : 'Missing';
}

function resolveEmailDelivery() {
  const provider = resolveEmailProvider();

  if (provider === 'resend') {
    return resolveResendStatus() === 'Configured' ? 'Resend enabled' : 'Resend misconfigured';
  }

  return resolveSmtpStatus() === 'Configured' ? 'SMTP enabled' : 'SMTP misconfigured';
}

function resolvePaymentWebhookStatus(paymentProvider: string) {
  switch (paymentProvider.toLowerCase()) {
    case 'stripe':
      return isConfigured(process.env.STRIPE_WEBHOOK_SECRET) ? 'Configured' : 'Missing';
    case 'paystack':
      return isConfigured(process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY) ? 'Configured' : 'Missing';
    case 'paddle':
      return isConfigured(process.env.PADDLE_WEBHOOK_SECRET) ? 'Configured' : 'Missing';
    case 'razorpay':
      return isConfigured(process.env.RAZORPAY_WEBHOOK_SECRET) ? 'Configured' : 'Missing';
    default:
      return 'N/A';
  }
}

function resolveClerkWebhookStatus(authProvider: string) {
  if (!isConfigured(process.env.CLERK_WEBHOOK_SECRET)) {
    return 'Missing';
  }

  return authProvider === 'clerk' ? 'Configured' : 'Configured (inactive)';
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatLoadAverage(values: number[]) {
  const [oneMinute = 0, fiveMinute = 0, fifteenMinute = 0] = values;
  return [oneMinute, fiveMinute, fifteenMinute]
    .map((value) => value.toFixed(2))
    .join(' / ');
}

function resolveNodeEnvironmentLabel() {
  const explicitNodeEnv = process.env.NODE_ENV?.trim();
  if (explicitNodeEnv) {
    return explicitNodeEnv;
  }

  const argv = process.argv.join(' ');
  if (argv.includes('next') && argv.includes(' start')) {
    return 'production (inferred)';
  }

  if (argv.includes('next') && argv.includes(' dev')) {
    return 'development (inferred)';
  }

  if (process.env.VERCEL) {
    return 'production (inferred)';
  }

  return 'unset';
}

export async function getAdminEnvironmentSettings(): Promise<AdminEnvironmentSetting[]> {
  const authProvider = process.env.AUTH_PROVIDER || 'betterauth';
  const paymentProvider = process.env.PAYMENT_PROVIDER || 'stripe';
  const databaseUrl = process.env.DATABASE_URL || '';
  const normalizedDatabaseUrl = databaseUrl.trim().toLowerCase();
  const databaseType = normalizedDatabaseUrl.startsWith('file:') || normalizedDatabaseUrl.includes('sqlite')
    ? 'SQLite'
    : normalizedDatabaseUrl.startsWith('postgres:') || normalizedDatabaseUrl.startsWith('postgresql:')
      ? 'PostgreSQL'
      : databaseUrl
        ? 'Custom'
        : 'Unset';
  const maintenanceMode =
    (await getSetting(SETTING_KEYS.MAINTENANCE_MODE, SETTING_DEFAULTS[SETTING_KEYS.MAINTENANCE_MODE])) === 'true'
      ? 'Enabled'
      : 'Disabled';
  const supportEmail = await getSetting(SETTING_KEYS.SUPPORT_EMAIL, SETTING_DEFAULTS[SETTING_KEYS.SUPPORT_EMAIL]);

  return [
    { key: 'MAINTENANCE_MODE', value: maintenanceMode, description: 'Routes are gated behind the maintenance screen when enabled' },
    { key: 'DATABASE_TYPE', value: databaseType, description: 'Database engine inferred from DATABASE_URL' },
    { key: 'NODE_ENV', value: resolveNodeEnvironmentLabel(), description: 'Runtime environment as reported or inferred from the current server process' },
    { key: 'AUTH_PROVIDER', value: authProvider, description: 'Active authentication provider' },
    { key: 'PAYMENT_PROVIDER', value: paymentProvider, description: 'Active payment provider' },
    { key: 'FILE_STORAGE', value: resolveStorageBackend(), description: 'Upload backend used for logos and file assets' },
    { key: 'FILE_STORAGE_BUCKET', value: resolveStorageBucketStatus(), description: 'S3 bucket wiring for file uploads' },
    { key: 'FILE_STORAGE_ENDPOINT', value: resolveStorageEndpointStatus(), description: 'Custom S3-compatible endpoint status' },
    { key: 'EMAIL_DELIVERY', value: resolveEmailDelivery(), description: 'Selected email transport and readiness' },
    { key: 'NODEMAILER_SMTP', value: resolveSmtpStatus(), description: 'SMTP credentials for Nodemailer delivery' },
    { key: 'RESEND_API', value: resolveResendStatus(), description: 'Resend API key availability' },
    { key: 'SUPPORT_EMAIL', value: supportEmail ? 'Configured' : 'Missing', description: 'Support mailbox used for ticket notifications' },
    { key: 'INTERNAL_API_BEARER', value: isConfigured(process.env.INTERNAL_API_TOKEN) ? 'Configured' : 'Missing', description: 'Server-to-server bearer token for internal endpoints' },
    {
      key: 'CRON_BEARER',
      value: [process.env.CRON_PROCESS_EXPIRY_TOKEN, process.env.CRON_SECRET, process.env.CRON_TOKEN].some(isConfigured)
        ? 'Configured'
        : 'Missing',
      description: 'Bearer token coverage for the expiry cron endpoint'
    },
    {
      key: 'HEALTHCHECK_TOKEN',
      value: isConfigured(process.env.HEALTHCHECK_TOKEN) ? 'Configured' : 'Missing',
      description: 'Authentication mode for the health endpoint'
    },
    {
      key: 'CLERK_WEBHOOK',
      value: resolveClerkWebhookStatus(authProvider),
      description: 'Webhook signing secret for Clerk user sync events'
    },
    {
      key: 'PAYMENT_WEBHOOK',
      value: resolvePaymentWebhookStatus(paymentProvider),
      description: 'Webhook secret availability for the active payment provider'
    },
    { key: 'DEMO_READ_ONLY_MODE', value: process.env.DEMO_READ_ONLY_MODE === 'true' ? 'Enabled' : 'Disabled', description: 'Global demo write protection' }
  ];
}

export async function getAdminRuntimeSnapshot(): Promise<AdminRuntimeSnapshot> {
  const memoryUsage = process.memoryUsage();
  const authProvider = process.env.AUTH_PROVIDER || 'betterauth';
  const paymentProvider = process.env.PAYMENT_PROVIDER || 'stripe';
  const maintenanceMode =
    (await getSetting(SETTING_KEYS.MAINTENANCE_MODE, SETTING_DEFAULTS[SETTING_KEYS.MAINTENANCE_MODE])) === 'true'
      ? 'Enabled'
      : 'Disabled';

  return {
    nodeVersion: process.version,
    runtime: process.release.name,
    deploymentTarget: process.env.VERCEL ? 'Vercel' : 'Node server',
    authProvider,
    paymentProvider,
    demoMode: process.env.DEMO_READ_ONLY_MODE === 'true' ? 'Enabled' : 'Disabled',
    maintenanceMode,
    fileStorage: resolveStorageBackend(),
    emailDelivery: resolveEmailDelivery(),
    platform: `${os.type()} ${os.release()}`,
    loadAverage: formatLoadAverage(os.loadavg()),
    cpuCores: `${os.cpus().length} logical cores`,
    totalMemory: formatBytes(os.totalmem()),
    freeMemory: formatBytes(os.freemem()),
    rssMemory: formatBytes(memoryUsage.rss),
    heapUsed: formatBytes(memoryUsage.heapUsed),
    appUptime: formatDuration(process.uptime()),
    hostUptime: formatDuration(os.uptime()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}