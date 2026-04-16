import { z } from 'zod';
import { SUPPORT_TICKET_CATEGORIES } from './support-ticket-categories';
import { NextRequest, NextResponse } from 'next/server';
import { Logger } from './logger';

// Common validation schemas
export const commonSchemas = {
  // String validations
  nonEmptyString: z.string().min(1).max(255),
  email: z.string().email(),
  url: z.string().url(),

  // ID validations
  userId: z.string().cuid(),
  planId: z.string().min(1).max(50),
  paymentId: z.string().min(1).max(100),
  couponCode: z.string().regex(/^[A-Za-z0-9-]{3,64}$/),
  planRecurringInterval: z.enum(['day', 'week', 'month', 'year']),
  organizationTokenPoolStrategy: z.enum(['SHARED_FOR_ORG', 'ALLOCATED_PER_MEMBER']),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().min(1).max(1000).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
  }),

  // Settings
  settingKey: z.enum([
    'MAINTENANCE_MODE',

    'FREE_PLAN_TOKEN_LIMIT',
    'FREE_PLAN_RENEWAL_TYPE',
    'FREE_PLAN_TOKEN_NAME',
    'SUPPORT_EMAIL',
    'ANNOUNCEMENT_MESSAGE',
    'SITE_NAME'
  ]),

  // Notification types
  notificationType: z.enum([
    'SYSTEM',
    'PAYMENT',
    'SUBSCRIPTION',
    'FEATURE',
    'SECURITY'
  ]),
};

const externalPriceIdCreateSchema = z
  .union([z.string().trim().min(3).max(200), z.literal('')])
  .optional()
  .transform(value => {
    if (value === undefined) return undefined;
    if (value === '') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const externalPriceIdUpdateSchema = z
  .union([z.string().trim().min(3).max(200), z.literal(''), z.null()])
  .optional()
  .transform(value => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

// API route validation schemas
export const apiSchemas = {
  // Admin settings
  adminSettingsUpdate: z.object({
    key: commonSchemas.settingKey,
    value: z.string().max(1000), // Reasonable limit for setting values
  }),

  // User settings
  userSettingsUpdate: z.object({
    key: z.string().min(1).max(100),
    value: z.string().max(500),
  }),

  // Support ticket
  supportTicket: z.object({
    subject: z.string().min(1).max(200),
    message: z.string().min(10).max(5000),
    category: z.enum(SUPPORT_TICKET_CATEGORIES).default('GENERAL'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  }),

  // Ticket reply
  ticketReply: z.object({
    message: z.string().min(1).max(5000),
  }),

  // Notification creation
  notificationCreate: z.object({
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(1000),
    type: commonSchemas.notificationType,
    targetUserId: commonSchemas.userId.optional(),
  }),

  // Checkout
  checkout: z.object({
    planId: commonSchemas.planId,
    couponCode: commonSchemas.couponCode.optional(),
    skipProrationCheck: z.boolean().optional(),
    prorationFallbackReason: z.string().min(1).max(100).optional(),
  }),

  // Refund
  refund: z.object({
    reason: z.enum([
      'duplicate',
      'fraudulent',
      'requested_by_customer',
      'testing'
    ]).optional(),
    notes: z.string().max(500).optional(),
    cancelSubscription: z.boolean().optional(),
    cancelMode: z.enum(['immediate', 'period_end']).optional(),
    localCancelMode: z.enum(['immediate', 'period_end']).optional(),
    clearPaidTokens: z.boolean().optional(),
  }),

  // Admin plans
  adminPlanCreate: z.object({
    name: commonSchemas.nonEmptyString.max(120),
    shortDescription: z.union([z.string().max(200), z.null()]).optional(),
    description: z.union([z.string().max(2000), z.null()]).optional(),
    durationHours: z.number().int().min(1).max(8760),
    isLifetime: z.boolean().optional().default(false),
    priceCents: z.number().int().min(0).max(500000),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(-1000).max(10000).default(0),
    externalPriceId: externalPriceIdCreateSchema,
    stripePriceId: externalPriceIdCreateSchema,
    autoRenew: z.boolean().default(false),
    recurringInterval: commonSchemas.planRecurringInterval.default('month'),
    recurringIntervalCount: z.number().int().min(1).max(365).default(1),
    tokenLimit: z.union([z.number().int().min(0), z.null()]).optional(),
    tokenName: z.union([z.string().max(100), z.null()]).optional(),
    supportsOrganizations: z.boolean().optional().default(false),
    organizationSeatLimit: z.union([z.number().int().min(1), z.null()]).optional(),
    organizationTokenPoolStrategy: z.union([commonSchemas.organizationTokenPoolStrategy, z.null()]).optional(),
  }).superRefine((data, ctx) => {
    if (data.autoRenew && data.isLifetime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isLifetime'],
        message: 'Lifetime access is only supported for one-time plans.',
      });
    }
  }),
  adminPlanUpdate: z.object({
    name: z.string().min(1).max(120).optional(),
    shortDescription: z.union([z.string().max(200), z.null()]).optional(),
    description: z.union([z.string().max(2000), z.null()]).optional(),
    durationHours: z.number().int().min(1).max(8760).optional(),
    isLifetime: z.boolean().optional(),
    priceCents: z.number().int().min(0).max(500000).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(-1000).max(10000).optional(),
    externalPriceId: externalPriceIdUpdateSchema,
    stripePriceId: externalPriceIdUpdateSchema,
    autoRenew: z.boolean().optional(),
    recurringInterval: commonSchemas.planRecurringInterval.optional(),
    recurringIntervalCount: z.number().int().min(1).max(365).optional(),
    tokenLimit: z.union([z.number().int().min(0), z.null()]).optional(),
    tokenName: z.union([z.string().max(100), z.null()]).optional(),
    supportsOrganizations: z.boolean().optional(),
    organizationSeatLimit: z.union([z.number().int().min(1), z.null()]).optional(),
    organizationTokenPoolStrategy: z.union([commonSchemas.organizationTokenPoolStrategy, z.null()]).optional(),
    createStripePrice: z.boolean().optional().default(false),
  }).superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      });
    }

    if (data.autoRenew === true && data.isLifetime === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isLifetime'],
        message: 'Lifetime access is only supported for one-time plans.',
      });
    }
  }),
  adminPlanToggle: z.object({
    active: z.boolean(),
  }),
};

// Validation result types
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues?: string[] };

// Type guard so TS can narrow ValidationResult to the failure case
export function isValidationFailure<T>(v: ValidationResult<T>): v is { success: false; error: string; issues?: string[] } {
  return v.success === false;
}

// Generic validation function
export function validateInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown
): ValidationResult<z.output<TSchema>> {
  try {
    const data = schema.parse(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(err =>
        `${err.path.join('.')}: ${err.message}`
      );
      return {
        success: false,
        error: 'Invalid input data',
        issues
      };
    }
    return {
      success: false,
      error: 'Validation failed'
    };
  }
}

// Validation middleware for API routes
export function withValidation<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  handler: (req: NextRequest, data: z.output<TSchema>, context?: unknown) => Promise<Response>
) {
  return async (req: NextRequest, context?: unknown) => {
    try {
      let input: unknown;

      // Handle different content types
      const contentType = req.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        input = await req.json();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData();
        input = Object.fromEntries(formData.entries());
      } else if (req.method === 'GET') {
        // Handle query parameters
        const url = new URL(req.url);
        input = Object.fromEntries(url.searchParams.entries());
      } else {
        Logger.warn('Unsupported content type for validation', { contentType });
        return NextResponse.json(
          { error: 'Unsupported content type' },
          { status: 400 }
        );
      }

      const validation = validateInput(schema, input);

      if (isValidationFailure(validation)) {
        Logger.warn('Input validation failed', {
          error: validation.error,
          issues: validation.issues,
          method: req.method,
          url: req.url,
        });

        return NextResponse.json(
          {
            error: validation.error,
            details: validation.issues
          },
          { status: 400 }
        );
      }

      return await handler(req, validation.data, context);

    } catch (error) {
      Logger.error('Validation middleware error', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

// URL parameter validation
export function validateParams<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  params: unknown
): ValidationResult<z.output<TSchema>> {
  return validateInput(schema, params);
}

// Query parameter validation
export function validateQuery<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  searchParams: URLSearchParams
): ValidationResult<z.output<TSchema>> {
  const query = Object.fromEntries(searchParams.entries());
  return validateInput(schema, query);
}

// Sanitization helpers
export const sanitize = {
  // Remove HTML tags and dangerous characters
  html: (input: string): string => {
    return input
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>&"']/g, '') // Remove dangerous characters
      .trim();
  },

  // Basic SQL injection prevention (additional to Prisma's built-in protection)
  sql: (input: string): string => {
    return input
      .replace(/[';-]/g, '') // Remove SQL comment and termination chars
      .replace(/--/g, '') // Remove SQL comments
      .trim();
  },

  // Path traversal prevention
  path: (input: string): string => {
    return input
      .replace(/\.\./g, '') // Remove path traversal
      .replace(/[\\\/]/g, '') // Remove path separators
      .trim();
  },

  // Filename sanitization
  filename: (input: string): string => {
    return input
      .replace(/[^a-zA-Z0-9._-]/g, '') // Only allow alphanumeric, dots, dashes
      .slice(0, 255) // Limit length
      .trim();
  },
};

// Rate limiting validation
export const rateLimitSchemas = {
  apiGeneral: z.object({
    limit: z.number().default(100),
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
  }),

  apiSensitive: z.object({
    limit: z.number().default(10),
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
  }),
};

// Free plan settings validation
export const freePlanSchemas = {
  tokenLimit: z.coerce.number().min(0).max(999999),
  renewalType: z.enum(['unlimited', 'daily', 'monthly', 'one-time']),
  tokenName: z.string().max(50).optional().transform(val => val?.trim() || ''),
};
