import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { sendEmail, getSupportEmail, getSiteLogo, getSiteName } from './email';
import { getSetting, SETTING_DEFAULTS, SETTING_KEYS, parseStringListSetting } from './settings';
import { EmailVariables } from './email-templates';

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const NOTIFICATION_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return char;
    }
  });
}

export type NotificationType = 'BILLING' | 'SUPPORT' | 'ACCOUNT' | 'GENERAL' | 'TEAM_INVITE';

interface BillingNotificationOptions {
  userId: string;
  title: string;
  message: string;
  templateKey?: string;
  variables?: Partial<EmailVariables>;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
}

interface AdminNotificationOptions {
  title: string;
  message: string;
  alertType?: AdminAlertEmailType;
  templateKey?: string;
  variables?: Partial<EmailVariables>;
  userId?: string;
  to?: string;
  actorId?: string;
  actorRole?: string;
  actorName?: string;
  actorEmail?: string;
}

export type AdminAlertEmailType =
  | 'refund'
  | 'new_purchase'
  | 'renewal'
  | 'upgrade'
  | 'downgrade'
  | 'payment_failed'
  | 'dispute'
  | 'other';

export type SupportEmailNotificationType =
  | 'new_ticket_to_admin'
  | 'admin_reply_to_user'
  | 'user_reply_to_admin';

export async function isAdminAlertEmailEnabled(alertType: AdminAlertEmailType): Promise<boolean> {
  const raw = await getSetting(
    SETTING_KEYS.ADMIN_ALERT_EMAIL_TYPES,
    SETTING_DEFAULTS[SETTING_KEYS.ADMIN_ALERT_EMAIL_TYPES]
  );
  const enabled = parseStringListSetting(raw);
  return enabled.has(alertType);
}

export async function isSupportEmailNotificationEnabled(type: SupportEmailNotificationType): Promise<boolean> {
  const raw = await getSetting(
    SETTING_KEYS.SUPPORT_EMAIL_NOTIFICATION_TYPES,
    SETTING_DEFAULTS[SETTING_KEYS.SUPPORT_EMAIL_NOTIFICATION_TYPES]
  );
  const enabled = parseStringListSetting(raw);
  return enabled.has(type);
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'GENERAL',
  url?: string | null
) {
  try {
    const data: {
      userId: string;
      title: string;
      message: string;
      type: NotificationType;
      read: boolean;
      url?: string;
    } = {
      userId,
      title,
      message,
      type,
      read: false,
    };
    if (url && typeof url === 'string' && url.length > 0) {
      data.url = url;
    }

    return await prisma.notification.create({ data });
  } catch (error: unknown) {
    const e = toError(error);
    Logger.error('Error creating notification', { error: e.message });
    return null;
  }
}

export async function createBillingNotification(userId: string, message: string) {
  return createNotification(userId, 'Billing Update', message, 'BILLING');
}

/**
 * Unified billing notification helper that sends both in-app notification and email
 * @param options Notification configuration with optional email template
 * @returns Promise<{ notificationCreated: boolean; emailSent: boolean }>
 */
export async function sendBillingNotification(
  options: BillingNotificationOptions
): Promise<{ notificationCreated: boolean; emailSent: boolean }> {
  const { userId, title, message, templateKey, variables } = options;

  let notificationCreated = false;
  let emailSent = false;
  const dedupeSince = new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS);

  try {
    Logger.info('sendBillingNotification invoked', { userId, title, templateKey, variablesProvided: !!variables });
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        title,
        message,
        createdAt: { gte: dedupeSince },
      },
      select: { id: true },
    });
    if (existing) {
      Logger.info('Skipping duplicate billing notification (recent match)', {
        userId,
        title,
        notificationId: existing.id,
      });
      notificationCreated = true;
    } else {
    // Create in-app notification
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: 'BILLING',
        read: false,
      },
    });

    notificationCreated = !!notification;

    Logger.info('Billing notification created', {
      userId,
      notificationId: notification.id,
      title,
      templateKey,
    });
    }
  } catch (error) {
    Logger.error('Failed to create billing notification', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Send email if template specified
  if (templateKey && variables) {
    try {
      // Fetch user email
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      const resolvedEmail = user?.email || options.fallbackEmail || null;

      if (!resolvedEmail) {
        Logger.warn('Cannot send email notification - user email unavailable', {
          userId,
          templateKey,
        });
        return { notificationCreated, emailSent: false };
      }

      const resolvedName = user?.name || options.fallbackName || null;

      // Extract first and last name from full name (if available)
      const nameParts = resolvedName?.split(' ') || [];
      const firstName = nameParts[0] || 'there';
      const lastName = nameParts.slice(1).join(' ') || '';


      // Merge user details into variables and prefer the DB-backed settings when
      // template variables do not provide them. This ensures billing emails use
      // the configured site name/logo/support address (same as admin emails).
      const resolvedSiteName = variables.siteName || await getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);
      const resolvedSupportEmail = variables.supportEmail || await getSupportEmail().catch(() => process.env.SUPPORT_EMAIL || 'support@example.com');

      const emailVariables: Partial<EmailVariables> = {
        ...variables,
        firstName,
        lastName,
        fullName: resolvedName || 'there',
        userEmail: resolvedEmail,
        siteName: resolvedSiteName,
        supportEmail: resolvedSupportEmail,
        dashboardUrl: variables.dashboardUrl || `${DEFAULT_BASE_URL}/dashboard`,
        billingUrl: variables.billingUrl || `${DEFAULT_BASE_URL}/pricing`,
      };

      const siteName = emailVariables.siteName || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];

      const expectedSubject = `${siteName}: ${title}`;
      const recentEmail = await prisma.emailLog.findFirst({
        where: {
          userId,
          to: resolvedEmail,
          template: templateKey,
          subject: expectedSubject,
          status: 'SENT',
          createdAt: { gte: dedupeSince },
        },
        select: { id: true },
      });
      if (recentEmail) {
        Logger.info('Skipping duplicate billing email (recent match)', {
          userId,
          templateKey,
          emailLogId: recentEmail.id,
          to: resolvedEmail,
          subject: expectedSubject,
        });
        return { notificationCreated, emailSent: true };
      }

      if (!emailVariables.siteLogo) {
        emailVariables.siteLogo = await getSiteLogo();
      }

      await sendEmail({
        to: resolvedEmail,
        userId,
        subject: expectedSubject, // Fallback subject
        text: message, // Fallback plain text
        templateKey,
        variables: emailVariables,
      });

      emailSent = true;

      Logger.info('Billing email sent', {
        userId,
        email: resolvedEmail,
        templateKey,
      });
    } catch (error) {
      Logger.error('Failed to send billing email', {
        userId,
        templateKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { notificationCreated, emailSent };
}

export async function sendAdminNotificationEmail(options: AdminNotificationOptions): Promise<boolean> {
  if (process.env.SEND_ADMIN_BILLING_EMAILS !== 'true') {
    return false;
  }

  const alertType = options.alertType ?? 'other';
  const enabled = await isAdminAlertEmailEnabled(alertType);
  if (!enabled) {
    return false;
  }

  try {
    const adminEmail = options.to || await getSupportEmail();
    if (!adminEmail) {
      Logger.warn('Admin email not configured; skipping admin notification email');
      return false;
    }

    const siteName = options.variables?.siteName || await getSiteName() || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
    const siteLogo = options.variables?.siteLogo ?? (await getSiteLogo());

    const emailVariables: Partial<EmailVariables> = {
      siteName,
      supportEmail: options.variables?.supportEmail || adminEmail,
      siteLogo,
      ...options.variables,
    };

    if (options.userId && (!emailVariables.fullName || !emailVariables.userEmail)) {
      const user = await prisma.user.findUnique({
        where: { id: options.userId },
        select: { name: true, email: true },
      });

      if (user) {
        if (!emailVariables.fullName) {
          emailVariables.fullName = user.name || user.email || 'Customer';
        }
        if (!emailVariables.userEmail) {
          emailVariables.userEmail = user.email || '';
        }
      }
    }

    const timestamp = new Date().toLocaleString();
    if (!emailVariables.startedAt) {
      emailVariables.startedAt = timestamp;
    }

    const resolvedActorId = emailVariables.actorId || options.actorId;
    const resolvedActorRole = emailVariables.actorRole || options.actorRole;
    let resolvedActorName = emailVariables.actorName || options.actorName;
    let resolvedActorEmail = emailVariables.actorEmail || options.actorEmail;

    if (resolvedActorId && (!resolvedActorName || !resolvedActorEmail)) {
      try {
        const actor = await prisma.user.findUnique({
          where: { id: resolvedActorId },
          select: { name: true, email: true },
        });

        if (actor) {
          if (!resolvedActorName) {
            resolvedActorName = actor.name || actor.email || resolvedActorId;
          }
          if (!resolvedActorEmail) {
            resolvedActorEmail = actor.email || undefined;
          }
        }
      } catch (err) {
        Logger.warn('Failed to enrich actor details for admin notification email', {
          actorId: resolvedActorId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (resolvedActorId) {
      emailVariables.actorId = resolvedActorId;
    }
    if (resolvedActorRole) {
      emailVariables.actorRole = resolvedActorRole;
    }
    if (resolvedActorName) {
      emailVariables.actorName = resolvedActorName;
    }
    if (resolvedActorEmail) {
      emailVariables.actorEmail = resolvedActorEmail;
    }

    if (!emailVariables.eventTitle) {
      emailVariables.eventTitle = options.title;
    }

    if (!emailVariables.eventSummary) {
      emailVariables.eventSummary = options.message;
    }

    const detailEntries: Array<{ label: string; value: string }> = [];
    const pushDetail = (label: string, raw?: string | null) => {
      const value = raw?.toString().trim();
      if (value) {
        detailEntries.push({ label, value });
      }
    };

    const combinedUser = [
      emailVariables.fullName,
      emailVariables.userEmail ? `(${emailVariables.userEmail})` : undefined,
    ].filter(Boolean).join(' ');

    if (combinedUser) {
      pushDetail('User', combinedUser);
    }

    if (options.userId) {
      pushDetail('User ID', options.userId);
    }

    const actorSummary = [
      resolvedActorName,
      resolvedActorEmail ? `(${resolvedActorEmail})` : undefined,
      resolvedActorRole ? `– ${resolvedActorRole}` : undefined,
    ].filter(Boolean).join(' ');

    if (actorSummary) {
      pushDetail('Actor', actorSummary);
    }

    if (resolvedActorId) {
      pushDetail('Actor ID', resolvedActorId);
    }

    pushDetail('Plan', emailVariables.planName);
    pushDetail('Amount', emailVariables.amount);
    pushDetail('Transaction ID', emailVariables.transactionId);
    pushDetail('Token Delta', emailVariables.tokenDelta);
    pushDetail('Token Balance', emailVariables.tokenBalance);
    pushDetail('Reason', emailVariables.reason);
    pushDetail('Timestamp', emailVariables.startedAt);

    if (emailVariables.detailsJson) {
      try {
        const parsed = JSON.parse(emailVariables.detailsJson);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === 'object') {
              const label = typeof (item as { label?: unknown }).label === 'string'
                ? (item as { label: string }).label
                : typeof (item as { key?: unknown }).key === 'string'
                  ? (item as { key: string }).key
                  : undefined;
              const rawValue = (item as { value?: unknown }).value;
              const value = rawValue == null ? undefined : String(rawValue);
              if (label && value) {
                pushDetail(label, value);
              }
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (value != null) {
              pushDetail(key.replace(/[_-]/g, ' '), String(value));
            }
          }
        }
      } catch (err) {
        Logger.warn('Failed to parse admin notification detailsJson', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!emailVariables.detailsHtml) {
      emailVariables.detailsHtml = detailEntries.length
        ? `<ul>${detailEntries
          .map(({ label, value }) => `<li><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></li>`)
          .join('')}</ul>`
        : '<p>No additional details were provided.</p>';
    }

    if (!emailVariables.detailsText) {
      emailVariables.detailsText = detailEntries.length
        ? detailEntries.map(({ label, value }) => `${label}: ${value}`).join('\n')
        : 'No additional details were provided.';
    }

    if (!emailVariables.actionUrl && options.userId) {
      const trimmedBase = DEFAULT_BASE_URL.endsWith('/') ? DEFAULT_BASE_URL.slice(0, -1) : DEFAULT_BASE_URL;
      const encodedId = encodeURIComponent(options.userId);
      emailVariables.actionUrl = `${trimmedBase}/admin/users?userId=${encodedId}`;
    }

    if (emailVariables.actionUrl && !emailVariables.actionText) {
      emailVariables.actionText = 'Open user record';
    }

    if (!emailVariables.actionUrl && !emailVariables.actionText) {
      emailVariables.actionText = 'No direct link available';
    }

    if (!emailVariables.actionButtonHtml) {
      emailVariables.actionButtonHtml = emailVariables.actionUrl && emailVariables.actionText && emailVariables.actionUrl.length > 0
        ? `<div class="actions"><a href="${escapeHtml(emailVariables.actionUrl)}" class="button">${escapeHtml(emailVariables.actionText)}</a></div>`
        : '';
    }

    const subjectTitle = emailVariables.eventTitle || options.title;
    const rawTransactionId = typeof emailVariables.transactionId === 'string' ? emailVariables.transactionId.trim() : '';
    const transactionSuffix = rawTransactionId ? ` [${rawTransactionId}]` : '';
    const subjectWithContext = `${subjectTitle}${transactionSuffix}`;

    const dedupeSince = new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS);
    const expectedSubject = `${siteName}: ${subjectWithContext}`;
    const recentAdminEmail = await prisma.emailLog.findFirst({
      where: {
        to: adminEmail,
        template: options.templateKey || 'admin_notification',
        subject: expectedSubject,
        ...(options.userId ? { userId: options.userId } : null),
        status: 'SENT',
        createdAt: { gte: dedupeSince },
      },
      select: { id: true },
    });
    if (recentAdminEmail) {
      Logger.info('Skipping duplicate admin email (recent match)', {
        adminEmail,
        templateKey: options.templateKey || 'admin_notification',
        emailLogId: recentAdminEmail.id,
      });
      return true;
    }

    await sendEmail({
      to: adminEmail,
      subject: expectedSubject,
      text: options.message,
      templateKey: options.templateKey || 'admin_notification',
      variables: emailVariables,
    });

    Logger.info('Admin billing email sent', {
      adminEmail,
      templateKey: options.templateKey || 'admin_notification',
    });

    return true;
  } catch (error) {
    Logger.error('Failed to send admin billing email', {
      error: error instanceof Error ? error.message : String(error),
      templateKey: options.templateKey || 'admin_notification',
    });
    return false;
  }
}

/**
 * Notify users about expired subscriptions
 * Should be called after updating subscriptions to EXPIRED status
 */
export async function notifyExpiredSubscriptions(subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) return;

  try {
    const subscriptions = await prisma.subscription.findMany({
      where: { id: { in: subscriptionIds } },
      include: { plan: true, user: { select: { id: true } } }
    });

    for (const sub of subscriptions) {
      try {
        await sendBillingNotification({
          userId: sub.userId,
          title: 'Subscription Expired',
          message: `Your ${sub.plan.name} subscription has expired.`,
          templateKey: 'subscription_expired',
          variables: {
            planName: sub.plan.name,
            expiresAt: sub.expiresAt.toLocaleDateString(),
          }
        });

        Logger.info('Sent expiration notification', {
          userId: sub.userId,
          subscriptionId: sub.id,
          planName: sub.plan.name
        });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.warn('Failed to send expiration notification', {
          subscriptionId: sub.id,
          error: e.message
        });
      }
    }
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Failed to notify expired subscriptions', {
      error: e.message
    });
  }
}

export async function createSupportNotification(userId: string, message: string) {
  return createNotification(userId, 'Support Update', message, 'SUPPORT');
}

export async function createAccountNotification(userId: string, message: string) {
  return createNotification(userId, 'Account Update', message, 'ACCOUNT');
}

// Helper to send notifications to all users (admin only)
export async function createGlobalNotification(
  title: string,
  message: string,
  type: NotificationType = 'GENERAL'
) {
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    const notifications = users.map((user) => ({
      userId: (user && (user as { id?: unknown }).id) ? String((user as { id?: unknown }).id) : null,
      title,
      message,
      type
    })).filter(n => n.userId !== null) as { userId: string; title: string; message: string; type: NotificationType }[];

    return await prisma.notification.createMany({
      data: notifications
    });
  } catch (error: unknown) {
    const e = toError(error);
    Logger.error('Error creating global notification', { error: e.message });
    return null;
  }
}
