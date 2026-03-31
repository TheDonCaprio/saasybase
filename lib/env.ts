import { z } from 'zod';

// Environment variable validation schema
const envSchema = z
  .object({
    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Clerk Authentication
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required'),
    CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),

    // Stripe Payment Processing
    STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required'),

    // Stripe Price IDs — new contract names (PAYMENT_/SUBSCRIPTION_) and legacy fallbacks
    PAYMENT_PRICE_24H: z.string().min(1, 'PAYMENT_PRICE_24H must be set for one-time 24H plan').optional(),
    PAYMENT_PRICE_7D: z.string().min(1, 'PAYMENT_PRICE_7D must be set for one-time 7D plan').optional(),
    PAYMENT_PRICE_1M: z.string().min(1, 'PAYMENT_PRICE_1M must be set for one-time 1M plan').optional(),
    PAYMENT_PRICE_3M: z.string().min(1, 'PAYMENT_PRICE_3M must be set for one-time 3M plan').optional(),
    PAYMENT_PRICE_1Y: z.string().min(1, 'PAYMENT_PRICE_1Y must be set for one-time 1Y plan').optional(),
    SUBSCRIPTION_PRICE_1M: z.string().min(1, 'SUBSCRIPTION_PRICE_1M must be set for recurring 1M plan').optional(),
    SUBSCRIPTION_PRICE_3M: z.string().min(1, 'SUBSCRIPTION_PRICE_3M must be set for recurring 3M plan').optional(),
    SUBSCRIPTION_PRICE_1Y: z.string().min(1, 'SUBSCRIPTION_PRICE_1Y must be set for recurring 1Y plan').optional(),
    TEAM_SUBSCRIPTION_PRICE_1M: z.string().min(1, 'TEAM_SUBSCRIPTION_PRICE_1M must be set for recurring 1M team plan').optional(),
    TEAM_SUBSCRIPTION_PRICE_3M: z.string().min(1, 'TEAM_SUBSCRIPTION_PRICE_3M must be set for recurring 3M team plan').optional(),
    TEAM_SUBSCRIPTION_PRICE_1Y: z.string().min(1, 'TEAM_SUBSCRIPTION_PRICE_1Y must be set for recurring 1Y team plan').optional(),

    // Legacy Stripe Price IDs (still accepted to avoid breaking existing installs)
    PRICE_24H: z.string().min(1, 'PRICE_24H is required').optional(),
    PRICE_7D: z.string().min(1, 'PRICE_7D is required').optional(),
    PRICE_1M: z.string().min(1, 'PRICE_1M is required').optional(),
    PRICE_3M: z.string().min(1, 'PRICE_3M is required').optional(),
    PRICE_1Y: z.string().min(1, 'PRICE_1Y is required').optional(),

    // Application
    NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),

    // Email (optional for development)
    EMAIL_PROVIDER: z.enum(['nodemailer', 'resend']).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    SUPPORT_EMAIL: z.string().email().optional(),

    // Security
    ENCRYPTION_SECRET: z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 characters'),

    // Development
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DEV_ADMIN_ID: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const requireOne = (primaryKeys: string[], legacyKeys: string[]) => {
      const hasPrimary = primaryKeys.some((key) => {
        const value = (env as Record<string, string | undefined>)[key];
        return typeof value === 'string' && value.length > 0;
      });
      const hasLegacy = legacyKeys.some((key) => {
        const value = (env as Record<string, string | undefined>)[key];
        return typeof value === 'string' && value.length > 0;
      });
      if (!hasPrimary && !hasLegacy) {
        const displayPrimary = primaryKeys.join(' or ');
        const displayLegacy = legacyKeys.join(' or ');
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [primaryKeys[0]],
          message: `Set ${displayPrimary} (preferred) or legacy ${displayLegacy} in your environment`,
        });
      }
    };

    requireOne(['PAYMENT_PRICE_24H'], ['PRICE_24H']);
    requireOne(['PAYMENT_PRICE_7D'], ['PRICE_7D']);
    requireOne(['PAYMENT_PRICE_1M', 'SUBSCRIPTION_PRICE_1M'], ['PRICE_1M']);
    requireOne(['PAYMENT_PRICE_3M', 'SUBSCRIPTION_PRICE_3M'], ['PRICE_3M']);
    requireOne(['PAYMENT_PRICE_1Y', 'SUBSCRIPTION_PRICE_1Y'], ['PRICE_1Y']);

    if ((env.EMAIL_PROVIDER ?? 'nodemailer') === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
  if (validatedEnv) return validatedEnv;
  
  try {
    validatedEnv = envSchema.parse(process.env);
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Environment validation failed:\n${missingVars.join('\n')}`);
    }
    throw error;
  }
}

// Validate required environment variables for specific features
export function validateStripeEnv() {
  const env = validateEnv();
  const resolvedPrice = (preferredKeys: string[], legacyKeys: string[]) => {
    for (const key of preferredKeys) {
      const value = (env as Record<string, string | undefined>)[key];
      if (value) return value;
    }
    for (const key of legacyKeys) {
      const value = (env as Record<string, string | undefined>)[key];
      if (value) return value;
    }
    return undefined;
  };

  const priceMap = {
    '24H': resolvedPrice(['PAYMENT_PRICE_24H'], ['PRICE_24H']),
    '7D': resolvedPrice(['PAYMENT_PRICE_7D'], ['PRICE_7D']),
    '1M': resolvedPrice(['PAYMENT_PRICE_1M', 'SUBSCRIPTION_PRICE_1M'], ['PRICE_1M']),
    '3M': resolvedPrice(['PAYMENT_PRICE_3M', 'SUBSCRIPTION_PRICE_3M'], ['PRICE_3M']),
    '1Y': resolvedPrice(['PAYMENT_PRICE_1Y', 'SUBSCRIPTION_PRICE_1Y'], ['PRICE_1Y']),
  } as Record<string, string | undefined>;

  const missing = Object.entries(priceMap)
    .filter(([, value]) => !value)
    .map(([planId]) => planId);

  if (missing.length > 0) {
    throw new Error(`Missing Stripe price IDs for plans: ${missing.join(', ')}`);
  }

  return {
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    stripePublishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    priceIds: priceMap as Record<string, string>,
  };
}

export function validateClerkEnv() {
  const env = validateEnv();
  return {
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  };
}

// Get environment variables safely with validation
export function getEnv(): Env {
  return validateEnv();
}
