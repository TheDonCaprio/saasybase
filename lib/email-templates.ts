import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';

/**
 * Common email template variables available across all templates
 */
export type EmailVariables = {
  // User details
  firstName?: string;
  lastName?: string;
  fullName?: string;
  userEmail?: string;
  
  // Transaction/Payment details
  transactionId?: string;
  amount?: string;
  currency?: string;
  
  // Subscription/Plan details
  planName?: string;
  planDescription?: string;
  expiresAt?: string;
  startedAt?: string;
  tokenAmount?: string;
  tokenName?: string;
  tokenDelta?: string;
  tokenBalance?: string;
  reason?: string;
  
  // Site details
  siteName?: string;
  supportEmail?: string;
  siteUrl?: string;
  siteLogo?: string;
  siteBrandHtml?: string;
  
  // Action URLs
  dashboardUrl?: string;
  billingUrl?: string;

  // Admin event metadata
  eventTitle?: string;
  eventSummary?: string;
  detailsHtml?: string;
  detailsText?: string;
  actionButtonHtml?: string;
  actionUrl?: string;
  actionText?: string;
  detailsJson?: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  
  // Custom fields (any additional data)
  [key: string]: string | undefined;
};

const SITE_LOGO_PLACEHOLDER_PATTERN = /<img\b[^>]*src=["']\{\{siteLogo\}\}["'][^>]*>/gi;

/**
 * Render a template by replacing {{variable}} placeholders with actual values
 */
export function renderTemplate(template: string, variables: EmailVariables): string {
  let rendered = template;

  const siteLogo = variables.siteLogo?.trim() ?? '';
  const shouldUseBrandFallback = !siteLogo || siteLogo.startsWith('data:image/');

  if (shouldUseBrandFallback && variables.siteBrandHtml) {
    rendered = rendered.replace(SITE_LOGO_PLACEHOLDER_PATTERN, variables.siteBrandHtml);
  }
  
  // Replace all {{variable}} patterns with corresponding values
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(pattern, String(value));
    }
  }
  
  // Remove any remaining unmatched variables (leave as empty string)
  rendered = rendered.replace(/\{\{[^}]+\}\}/g, '');
  
  return rendered;
}

/**
 * Fetch an email template by key and render it with variables
 */
export async function getRenderedTemplate(
  templateKey: string,
  variables: EmailVariables
): Promise<{ subject: string; html: string; text: string } | null> {
  try {
    const template = await prisma.emailTemplate.findUnique({
      where: { key: templateKey, active: true }
    });
    
    if (!template) {
      Logger.info('Email template not found or inactive', { templateKey });
      return null;
    }
    
    return {
      subject: renderTemplate(template.subject, variables),
      html: renderTemplate(template.htmlBody, variables),
      text: template.textBody ? renderTemplate(template.textBody, variables) : ''
    };
  } catch (err: unknown) {
    const e = toError(err);
    Logger.warn('Failed to fetch/render email template', { 
      templateKey, 
      error: e.message 
    });
    return null;
  }
}

/**
 * Get default template definitions for seeding
 */
export function getDefaultTemplates() {
  return [
    {
      key: 'welcome',
      name: 'Welcome Email',
      description: 'Sent when a user successfully registers for an account',
      subject: 'Welcome to {{siteName}}, {{firstName}}!',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 36px; text-align: center; }
    .header h1 { margin: 0; font-size: 32px; }
    .header p { margin: 8px 0 0; opacity: 0.95; font-size: 16px; }
    .content { background: #ffffff; padding: 36px; }
    .intro { margin-bottom: 28px; }
    .intro p { margin: 0 0 16px; }
    .features { background: #f9fafb; border-radius: 12px; padding: 24px; margin: 28px 0; }
    .feature-list { list-style: none; padding: 0; margin: 0; }
    .feature-list li { padding: 8px 0; display: flex; align-items: center; }
    .feature-list li:before { content: "✓"; color: #10b981; font-weight: bold; margin-right: 12px; font-size: 18px; }
    .cta-section { margin: 32px 0; text-align: center; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .button:hover { opacity: 0.95; }
    .next-steps { background: #ecf0ff; border: 1px solid #d1d5f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .next-steps h3 { margin: 0 0 12px; color: #667eea; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
    .next-steps ol { margin: 0; padding-left: 20px; }
    .next-steps li { margin: 8px 0; color: #4c5a8a; }
    .support-info { background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0; font-size: 13px; }
    .support-info p { margin: 0 0 8px; }
    .support-info a { color: #667eea; text-decoration: none; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>🎉 Welcome!</h1>
        <p>Your account is ready to go</p>
      </div>
      <div class="content">
        <div class="intro">
          <p>Hi {{firstName}},</p>
          <p>Thanks for joining <strong>{{siteName}}</strong>! We're excited to have you on board. Your account has been successfully created and is ready to use.</p>
        </div>

        <div class="features">
          <p style="margin: 0 0 12px; font-weight: 600;">Get started with these features:</p>
          <ul class="feature-list">
            <li>Access your personal dashboard and manage your profile</li>
            <li>Explore all available tools and services</li>
            <li>Manage your preferences and settings</li>
            <li>Get support whenever you need it</li>
          </ul>
        </div>

        <div class="cta-section">
          <a href="{{dashboardUrl}}" class="button">Go to Dashboard</a>
        </div>

        <div class="next-steps">
          <h3>Next Steps</h3>
          <ol>
            <li><strong>Complete your profile</strong> – Add a profile picture and update your information</li>
            <li><strong>Explore the platform</strong> – Familiarize yourself with available features</li>
            <li><strong>Check settings</strong> – Customize preferences to suit your needs</li>
          </ol>
        </div>

        <p>If you have any questions or need assistance getting started, don't hesitate to reach out. We're here to help!</p>

        <div class="support-info">
          <p><strong>Questions?</strong></p>
          <p>Email us at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a> or visit our help center for common questions and tutorials.</p>
        </div>

        <p style="margin-bottom: 0;">Best regards,<br><strong>The {{siteName}} Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; {{siteName}}. All rights reserved.</p>
        <p>You received this email because you created an account. You can manage your email preferences in your account settings.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Welcome to {{siteName}}, {{firstName}}!

Hi {{firstName}},

Thanks for joining {{siteName}}! We're excited to have you on board. Your account has been successfully created and is ready to use.

Get started with these features:
✓ Access your personal dashboard and manage your profile
✓ Explore all available tools and services
✓ Manage your preferences and settings
✓ Get support whenever you need it

NEXT STEPS:
1. Complete your profile – Add a profile picture and update your information
2. Explore the platform – Familiarize yourself with available features
3. Check settings – Customize preferences to suit your needs

Go to your dashboard: {{dashboardUrl}}

If you have any questions or need assistance getting started, don't hesitate to reach out. We're here to help!

Questions?
Email us at {{supportEmail}} or visit our help center for common questions and tutorials.

Best regards,
The {{siteName}} Team

---
You received this email because you created an account. You can manage your email preferences in your account settings.
© {{siteName}}. All rights reserved.`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        userEmail: 'User\'s email address',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        dashboardUrl: 'Link to user dashboard',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_extended',
      name: 'Subscription Extended',
      description: 'Sent when an existing subscription is extended (e.g., by a one-time purchase or promo)',
      subject: '{{siteName}}: Your {{planName}} Subscription Has Been Extended',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .info-box { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .button { display: inline-block; background: #4facfe; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>📅 Subscription Extended</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Your <strong>{{planName}}</strong> subscription has been extended.</p>
      <div class="info-box">
        <strong>Details:</strong><br>
        Plan: {{planName}}<br>
        New expiry: {{newExpiry}}<br>
        {{tokenName}} added: {{tokensAdded}}
      </div>
      <p>If you have questions about this change, contact us at {{supportEmail}}.</p>
      <p><a href="{{dashboardUrl}}" class="button">Go to Dashboard</a></p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your {{planName}} subscription has been extended.

New expiry: {{newExpiry}}
{{tokenName}} added: {{tokensAdded}}

Visit your dashboard: {{dashboardUrl}}

Need help? Contact us at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        planName: 'Name of the plan',
        newExpiry: 'New expiry date',
        tokensAdded: 'Number of tokens added',
        tokenName: 'Label for tokens',
        siteName: 'Product or site name',
        siteLogo: 'URL of the site logo image displayed at the top of the email',
        supportEmail: 'Support contact email',
        dashboardUrl: 'Link to dashboard'
      })
    },
    {
      key: 'team_invitation',
      name: 'Team Invitation',
      description: 'Sent when a teammate invites you to join a workspace (accept or decline)',
      subject: '{{siteName}}: {{inviterName}} invited you to {{organizationName}}',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%); color: white; padding: 40px 36px; text-align: center; }
    .header h1 { margin: 0; font-size: 30px; }
    .header p { margin: 10px 0 0; opacity: 0.95; font-size: 16px; }
    .content { background: #ffffff; padding: 36px; }
    .pill { display: inline-block; padding: 8px 14px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .summary { margin: 20px 0 0; }
    .summary p { margin: 0 0 16px; }
    .invite-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .invite-card strong { color: #0f172a; }
    .cta-section { margin: 28px 0 22px; text-align: center; }
    .button { display: inline-block; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .button-primary { background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%); color: white; }
    .button-secondary { background: #ffffff; color: #dc2626; border: 1px solid #fecaca; margin-left: 12px; }
    .helper { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 18px; margin: 24px 0; color: #5b21b6; }
    .helper p { margin: 0 0 10px; }
    .helper a { color: #6d28d9; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>🤝 You&apos;re invited</h1>
        <p>Join {{organizationName}} on {{siteName}}</p>
      </div>
      <div class="content">
        <span class="pill">Workspace invitation</span>

        <div class="summary">
          <p>Hi there,</p>
          <p><strong>{{inviterName}}</strong> invited you to collaborate inside <strong>{{organizationName}}</strong> on <strong>{{siteName}}</strong>.</p>
        </div>

        <div class="invite-card">
          <p style="margin: 0 0 10px;"><strong>What happens when you accept?</strong></p>
          <p style="margin: 0;">You&apos;ll get access to the shared workspace, any included resources, and the team context tied to this invitation.</p>
        </div>

        <div class="cta-section">
          <a href="{{acceptUrl}}" class="button button-primary">Accept invitation</a>
          <a href="{{declineUrl}}" class="button button-secondary">Decline</a>
        </div>

        <div class="helper">
          <p><strong>Need to create an account first?</strong></p>
          <p>Create one here: <a href="{{joinUrl}}">{{joinUrl}}</a></p>
          <p style="margin-bottom: 0;">Already registered? <a href="{{signInUrl}}">Sign in</a> and reopen the invite link.</p>
        </div>

        <p>If you have any questions, reply to <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
        <p style="margin-bottom: 0;">Best regards,<br><strong>The {{siteName}} Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; {{siteName}}. All rights reserved.</p>
        <p>This invitation was sent by {{inviterName}} for {{organizationName}}.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi there,

{{inviterName}} invited you to join {{organizationName}} on {{siteName}}.

Accept: {{acceptUrl}}

Decline: {{declineUrl}}

Need an account? Create one: {{joinUrl}}
Already registered? Sign in: {{signInUrl}}

Questions? Reply to {{supportEmail}}.

— The {{siteName}} Team`,
      variables: JSON.stringify({
        inviterName: "Name of the person who invited",
        organizationName: "Name of the workspace",
        acceptUrl: "Accept link (site)",
        declineUrl: "Decline link (site)",
        joinUrl: "Sign up link",
        signInUrl: "Sign in link",
        siteName: "Site name",
        supportEmail: "Support contact",
        siteLogo: "URL of site logo"
      })
    },
    {
      key: 'subscription_upgraded',
      name: 'Subscription Upgraded',
      description: 'Sent when a user upgrades from non-recurring to recurring plan',
      subject: '{{siteName}}: Subscription Upgraded to {{planName}}',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>🎉 Subscription Upgraded!</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Great news! Your subscription to <strong>{{planName}}</strong> is now active.</p>
      <p>Your previous non-recurring subscription has been replaced, and you now have access to all the benefits of your new plan.</p>
      <p><a href="{{dashboardUrl}}" class="button">View Dashboard</a></p>
      <p>If you have any questions, feel free to reach out to us at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>Transaction ID: {{transactionId}}</p>
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Great news! Your subscription to {{planName}} is now active.

Your previous non-recurring subscription has been replaced, and you now have access to all the benefits of your new plan.

Visit your dashboard: {{dashboardUrl}}

If you have any questions, reach out to us at {{supportEmail}}.

Best regards,
The {{siteName}} Team

Transaction ID: {{transactionId}}`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        lastName: 'User\'s last name',
        fullName: 'User\'s full name',
        planName: 'Name of the subscribed plan',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        dashboardUrl: 'Link to user dashboard',
        transactionId: 'Payment/transaction identifier',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'token_topup',
      name: 'Balance Top-Up',
      description: 'Sent when a user purchases additional balance/credits',
      subject: '{{siteName}}: {{tokenAmount}} {{tokenName}} Added to Your Account',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .highlight { background: #f0f7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>💎 {{tokenName}} Added!</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Your {{tokenName}} purchase was successful! We've added <strong>{{tokenAmount}} {{tokenName}}</strong> to your account.</p>
      <div class="highlight">
        <strong>Payment Details:</strong><br>
        Amount: {{amount}}<br>
        Transaction ID: {{transactionId}}
      </div>
      <p>Your recurring subscription continues unchanged, and these {{tokenName}} are ready to use immediately.</p>
      <p><a href="{{dashboardUrl}}" class="button">Use Your {{tokenName}}</a></p>
      <p>Thank you for your continued support!</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your {{tokenName}} purchase was successful! We've added {{tokenAmount}} {{tokenName}} to your account.

Payment Details:
Amount: {{amount}}
Transaction ID: {{transactionId}}

Your recurring subscription continues unchanged, and these {{tokenName}} are ready to use immediately.

Visit your dashboard: {{dashboardUrl}}

Thank you for your continued support!

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        lastName: 'User\'s last name',
        tokenAmount: 'Number of tokens added',
        tokenName: 'Name of the token type (e.g., Credits)',
        amount: 'Payment amount',
        transactionId: 'Payment/transaction identifier',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        dashboardUrl: 'Link to user dashboard',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'tokens_credited',
      name: 'Balance Credited',
      description: 'Sent when an admin credits balance/credits to a user account',
      subject: '{{siteName}}: {{tokenDelta}} {{tokenName}} Credited',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #34d399 0%, #10b981 100%); color: white; padding: 36px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #ffffff; padding: 36px; }
    .stat { display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 22px; margin: 22px 0; }
    .stat-value { font-size: 32px; font-weight: 700; color: #059669; }
    .highlight { background: #f0f4ff; border-left: 4px solid #6366f1; padding: 18px 22px; border-radius: 10px; margin-bottom: 24px; }
    .button { display: inline-block; background: #10b981; color: white; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 38px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>✨ {{tokenName}} Added!</h1>
        <p>Your balance just got a boost.</p>
      </div>
      <div class="content">
        <p>Hi {{firstName}},</p>
        <p>We've credited <strong>{{tokenDelta}} {{tokenName}}</strong> to your account on <strong>{{siteName}}</strong>. They're available to use right away.</p>
        <div class="stat">
          <div>
            <div style="font-size: 14px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.08em;">Current Balance</div>
            <div class="stat-value">{{tokenBalance}}</div>
          </div>
          <div style="text-align: right; font-size: 14px; color: #6b7280;">
            Adjustment: <strong>{{tokenDelta}}</strong><br/>
            Reason: {{reason}}
          </div>
        </div>
        <div class="highlight">
          <strong>What happens next?</strong>
          <p>Your new {{tokenName}} are live. Head to your dashboard to put them to work, or reply to this email if you have any questions.</p>
        </div>
        <p><a href="{{dashboardUrl}}" class="button">Open Dashboard</a></p>
        <p style="margin-top: 28px;">Thanks for being part of our community.<br/>— The {{siteName}} Team</p>
      </div>
    </div>
    <div class="footer">
      Need help? Contact us at <a href="mailto:{{supportEmail}}" style="color:#2563eb; text-decoration:none;">{{supportEmail}}</a>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Good news! {{tokenDelta}} {{tokenName}} were credited to your {{siteName}} account. Your new balance is {{tokenBalance}} {{tokenName}}.

Reason: {{reason}}

Use them anytime from your dashboard: {{dashboardUrl}}

Need help? Reach us at {{supportEmail}}.

— The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        tokenName: 'Name of the token/credit system (e.g., tokens, credits, points)',
        tokenDelta: 'Number of tokens added',
        tokenBalance: 'Current token balance after adjustment',
        reason: 'Optional reason provided by admin',
        siteName: 'Product or site name',
        dashboardUrl: 'Link to dashboard',
        supportEmail: 'Support contact email',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'tokens_debited',
      name: 'Balance Debited',
      description: 'Sent when an admin debits balance/credits from a user account',
      subject: '{{siteName}}: {{tokenDelta}} {{tokenName}} Debited',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; line-height: 1.7; color: #1f2933; background: #faf7f7; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 22px 38px -28px rgba(148,54,54,0.5); }
    .header { background: linear-gradient(140deg, #f97316 0%, #f43f5e 100%); color: white; padding: 34px; text-align: center; }
    .header h1 { margin: 0; font-size: 26px; }
    .content { background: #ffffff; padding: 34px 36px; }
    .alert { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 11px; padding: 20px 22px; margin: 22px 0; color: #9f1239; }
    .balance { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #cbd5f5; border-radius: 12px; padding: 18px 22px; margin-bottom: 26px; }
    .balance-value { font-size: 30px; font-weight: 700; color: #be123c; }
    .button { display: inline-block; background: #1f2937; color: white; padding: 11px 26px; border-radius: 50px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 34px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>Heads Up, {{tokenName}} Adjusted</h1>
        <p>We wanted to let you know about a change.</p>
      </div>
      <div class="content">
        <p>Hi {{firstName}},</p>
        <p>We've debited <strong>{{tokenDelta}} {{tokenName}}</strong> from your account on {{siteName}}.</p>
        <div class="alert">
          <strong>Why am I seeing this?</strong><br/>
          Reason: {{reason}}
        </div>
        <div class="balance">
          <div>
            <div style="font-size: 14px; text-transform: uppercase; color: #64748b; letter-spacing: 0.08em;">Updated Balance</div>
            <div class="balance-value">{{tokenBalance}}</div>
          </div>
          <div style="text-align:right; font-size: 14px; color: #64748b;">
            Amount Debited<br/><strong>{{tokenDelta}}</strong>
          </div>
        </div>
        <p>If you have any questions about this adjustment, reply to this email and our team will be happy to help.</p>
        <p><a href="{{dashboardUrl}}" class="button">Review Activity</a></p>
        <p style="margin-top: 26px;">We're here to keep things transparent and fair.<br/>— The {{siteName}} Support Team</p>
      </div>
    </div>
    <div class="footer">
      Contact support: <a href="mailto:{{supportEmail}}" style="color:#ef4444; text-decoration:none;">{{supportEmail}}</a>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

{{tokenDelta}} {{tokenName}} were debited from your {{siteName}} account. Your new balance is {{tokenBalance}} {{tokenName}}.

Reason: {{reason}}

You can review your account activity anytime at {{dashboardUrl}}. If something looks off, reply to this email or contact us at {{supportEmail}}.

— The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        tokenName: 'Name of the token/credit system (e.g., tokens, credits, points)',
        tokenDelta: 'Number of tokens removed (negative values allowed)',
        tokenBalance: 'Balance after debit',
        reason: 'Explanation provided for the adjustment',
        siteName: 'Product or site name',
        dashboardUrl: 'Link to dashboard for review',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'admin_assigned_plan',
      name: 'Plan Assigned by Admin',
      description: 'Notifies the user when an administrator assigns them a plan',
      subject: '{{siteName}}: You Have Been Assigned the {{planName}} Plan',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f6f8fb; color: #1f2937; line-height: 1.7; }
    .container { max-width: 640px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 22px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 16px; overflow: hidden; box-shadow: 0 22px 44px -36px rgba(15,23,42,0.6); }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 40px 38px; }
    .header h1 { margin: 0; font-size: 30px; }
    .content { background: #ffffff; padding: 40px 42px; }
    .badge { display: inline-block; background: rgba(99,102,241,0.12); color: #4f46e5; border-radius: 999px; padding: 6px 16px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px; }
    .details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px 26px; margin: 24px 0; }
    .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 15px; }
    .detail-row:last-child { margin-bottom: 0; }
    .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 30px; border-radius: 999px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 34px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>Welcome to {{planName}}</h1>
        <p>Your access has been activated.</p>
      </div>
      <div class="content">
        <span class="badge">Plan Assigned by Admin</span>
        <p>Hi {{firstName}},</p>
        <p>We just activated the <strong>{{planName}}</strong> plan on your account. Your membership is live and ready to use.</p>
        <div class="details">
          <div class="detail-row"><span>Plan duration</span><strong>{{durationHours}} hours</strong></div>
          <div class="detail-row"><span>Access through</span><strong>{{expiresAt}}</strong></div>
          <div class="detail-row"><span>{{tokenName}} added</span><strong>{{tokenDelta}}</strong></div>
          <div class="detail-row"><span>Current {{tokenName}} balance</span><strong>{{tokenBalance}}</strong></div>
        </div>
        <p>Jump back into the app to explore everything that comes with this plan.</p>
        <p><a href="{{dashboardUrl}}" class="button">Go to Dashboard</a></p>
        <p style="margin-top: 28px;">If you have any questions, reply to this email or reach us anytime at {{supportEmail}}.</p>
        <p style="margin-top: 24px;">Cheers,<br/>The {{siteName}} Team</p>
      </div>
    </div>
    <div class="footer">
      You are receiving this email because a plan was assigned to your account on {{siteName}}.
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

An administrator just assigned the {{planName}} plan to your {{siteName}} account.

Duration: {{durationHours}} hours
Access through: {{expiresAt}}
{{tokenName}} added: {{tokenDelta}}
Current {{tokenName}} balance: {{tokenBalance}}

You can start using your plan right away: {{dashboardUrl}}

Questions? Contact us at {{supportEmail}}.

— The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        planName: 'Name of assigned plan',
        durationHours: 'Plan duration in hours',
        expiresAt: 'Plan expiry date/time',
        tokenName: 'Name of the token/credit system (e.g., tokens, credits, points)',
        tokenDelta: 'Tokens granted during assignment',
        tokenBalance: 'User token balance after assignment',
        dashboardUrl: 'Link to dashboard',
        supportEmail: 'Support contact email',
        siteName: 'Product or site name',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_activated',
      name: 'Subscription Activated',
      description: 'Sent when a pending subscription is activated',
      subject: '{{siteName}}: Your {{planName}} Subscription is Now Active',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .info-box { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .button { display: inline-block; background: #4facfe; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>✅ Subscription Activated!</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Your <strong>{{planName}}</strong> subscription is now active and ready to use.</p>
      <div class="info-box">
        <strong>Subscription Details:</strong><br>
        Plan: {{planName}}<br>
        Amount paid: {{amount}}<br>
        Transaction ID: {{transactionId}}<br>
        Started: {{startedAt}}<br>
        Expires: {{expiresAt}}
      </div>
      <p>You now have full access to all features included in your plan.</p>
      <p><a href="{{dashboardUrl}}" class="button">Go to Dashboard</a></p>
      <p>Need help getting started? Contact us at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your {{planName}} subscription is now active and ready to use.

Subscription Details:
Plan: {{planName}}
Amount paid: {{amount}}
Transaction ID: {{transactionId}}
Started: {{startedAt}}
Expires: {{expiresAt}}

You now have full access to all features included in your plan.

Visit your dashboard: {{dashboardUrl}}

Need help getting started? Contact us at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        lastName: 'User\'s last name',
        fullName: 'User\'s full name',
        planName: 'Name of the subscribed plan',
        amount: 'Amount paid (formatted, e.g. $49.00)',
        transactionId: 'Payment reference / transaction identifier',
        startedAt: 'Subscription start date',
        expiresAt: 'Subscription expiry date',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        dashboardUrl: 'Link to user dashboard',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'admin_notification',
      name: 'Admin Notification',
      description: 'Sent to admins for important billing or security events',
      subject: '{{siteName}}: Admin Alert - {{eventTitle}}',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1a202c; background: #f7fafc; }
    .container { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
    .brand { text-align: center; padding: 16px 0 12px; }
    .brand img { max-height: 52px; width: auto; display: inline-block; }
    .card { border-radius: 10px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(30, 41, 59, 0.65); }
    .header { background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); color: #fff; padding: 28px 32px; }
    .header .eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; opacity: 0.8; margin: 0 0 8px; }
    .header h2 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { background: #fff; padding: 32px; }
    .summary { margin: 0; font-size: 15px; color: #2d3748; }
    .details { margin: 24px 0; background: #edf2f7; border-radius: 8px; padding: 20px; }
    .details ul { list-style: none; padding: 0; margin: 0; }
    .details li { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #d8e0eb; font-size: 14px; }
    .details li:last-child { border-bottom: none; }
    .details .label { font-weight: 600; color: #2a4365; margin-right: 16px; }
    .details .value { font-family: "Menlo", "Courier New", monospace; color: #1a202c; text-align: right; }
    .actions { margin: 28px 0 0; text-align: center; }
    .actions a.button { display: inline-block; background: #2b6cb0; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-weight: 600; font-size: 14px; }
    .actions a.button:hover { background: #2c5282; }
    .footer-note { font-size: 12px; color: #4a5568; margin: 24px 0 0; }
    .footer { text-align: center; margin-top: 28px; color: #4a5568; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <p class="eyebrow">Admin Notification</p>
        <h2>{{eventTitle}}</h2>
      </div>
      <div class="content">
        <p class="summary">{{eventSummary}}</p>
        <div class="details">
          {{detailsHtml}}
        </div>
        {{actionButtonHtml}}
        <p class="footer-note">This message was sent to {{supportEmail}} for internal tracking.</p>
      </div>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}} Admin Panel</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Admin Notification - {{eventTitle}}

{{eventSummary}}

Details:
{{detailsText}}

Action: {{actionText}} {{actionUrl}}

This message was sent to {{supportEmail}} for internal tracking.`,
      variables: JSON.stringify({
        fullName: 'Full name of the user',
        userEmail: 'Email of the user',
        planName: 'Plan associated with the action',
        amount: 'Amount involved in the action',
        transactionId: 'Transaction or reference ID',
        tokenDelta: 'Amount of tokens credited or debited',
        tokenBalance: 'Resulting token balance',
        reason: 'Reason provided by the admin',
        startedAt: 'Timestamp of the event',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'Logo URL for branding',
        eventTitle: 'Title displayed in the notification header',
        eventSummary: 'Short summary describing the event',
        detailsHtml: 'HTML representation of event details',
        detailsText: 'Plain-text representation of the event details',
        actionUrl: 'Optional link to review the event',
        actionText: 'Label for the optional review link',
        actionButtonHtml: 'Optional custom HTML for the action button',
        actorId: 'Unique identifier of the acting admin or moderator',
        actorName: 'Display name of the acting admin or moderator',
        actorEmail: 'Email address of the acting admin or moderator',
        actorRole: 'Role of the acting admin or moderator at the time of the action'
      })
    },
    {
      key: 'refund_issued',
      name: 'Refund Issued',
      description: 'Sent when a payment is refunded',
      subject: '{{siteName}}: Refund Processed - {{amount}}',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .refund-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>💳 Refund Processed</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>A refund has been processed for your payment.</p>
      <div class="refund-box">
        <strong>Refund Details:</strong><br>
        Amount: <strong>{{amount}}</strong><br>
        Original Plan: {{planName}}<br>
        Transaction ID: {{transactionId}}<br>
        Date: {{startedAt}}
      </div>
      <p>The refund will appear in your account within 5-10 business days, depending on your financial institution.</p>
      <p>If you have any questions about this refund, please contact us at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

A refund has been processed for your payment.

Refund Details:
Amount: {{amount}}
Original Plan: {{planName}}
Transaction ID: {{transactionId}}
Date: {{startedAt}}

The refund will appear in your account within 5-10 business days, depending on your financial institution.

If you have any questions about this refund, please contact us at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        amount: 'Refund amount',
        planName: 'Original plan name',
        transactionId: 'Transaction identifier',
        startedAt: 'Refund date',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_cancelled',
      name: 'Subscription Cancelled',
      description: 'Sent when a subscription is cancelled',
      subject: '{{siteName}}: Subscription Cancelled',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .info-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>❌ Subscription Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Your <strong>{{planName}}</strong> subscription has been cancelled as requested.</p>
      <div class="info-box">
        <strong>Important Information:</strong><br>
        Your access will remain active until <strong>{{expiresAt}}</strong><br>
        No further charges will be made to your account.
      </div>
      <p>We're sorry to see you go! If you'd like to share feedback about your experience, we'd love to hear from you.</p>
      <p>You can reactivate your subscription at any time by visiting your account dashboard.</p>
      <p><a href="{{dashboardUrl}}" class="button">View Dashboard</a></p>
      <p>If this cancellation was made in error, please contact us immediately at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your {{planName}} subscription has been cancelled as requested.

Important Information:
Your access will remain active until {{expiresAt}}
No further charges will be made to your account.

We're sorry to see you go! If you'd like to share feedback about your experience, we'd love to hear from you.

You can reactivate your subscription at any time by visiting your account dashboard: {{dashboardUrl}}

If this cancellation was made in error, please contact us immediately at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        planName: 'Cancelled plan name',
        expiresAt: 'Access end date',
        dashboardUrl: 'Link to dashboard',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_expired',
      name: 'Subscription Expired',
      description: 'Sent when a subscription expires',
      subject: '{{siteName}}: Your {{planName}} Subscription Has Expired',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .expiry-box { background: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>⏰ Subscription Expired</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Your <strong>{{planName}}</strong> subscription has expired.</p>
      <div class="expiry-box">
        <strong>Subscription Details:</strong><br>
        Plan: {{planName}}<br>
        Expired: {{expiresAt}}<br>
        Status: <strong>Expired</strong>
      </div>
      <p>Your account has been switched to the free tier. To regain access to premium features, you can renew your subscription at any time.</p>
      <p><a href="{{billingUrl}}" class="button">Renew Subscription</a></p>
      <p>If you have any questions, feel free to reach out to us at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your {{planName}} subscription has expired.

Subscription Details:
Plan: {{planName}}
Expired: {{expiresAt}}
Status: Expired

Your account has been switched to the free tier. To regain access to premium features, you can renew your subscription at any time.

Renew your subscription: {{billingUrl}}

If you have any questions, feel free to reach out to us at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        planName: 'Expired plan name',
        expiresAt: 'Expiration date',
        billingUrl: 'Link to billing/pricing page',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_renewed',
      name: 'Subscription Renewed',
      description: 'Sent when a recurring subscription is successfully renewed',
      subject: '{{siteName}}: {{planName}} Subscription Renewed',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .renewal-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #4facfe; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>🔄 Subscription Renewed!</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Great news! Your <strong>{{planName}}</strong> subscription has been successfully renewed.</p>
      <div class="renewal-box">
        <strong>Renewal Details:</strong><br>
        Plan: {{planName}}<br>
        Amount Charged: {{amount}}<br>
        Transaction ID: {{transactionId}}<br>
        Next Renewal: {{expiresAt}}
      </div>
      <p>Your subscription will continue uninterrupted, and you'll have access to all premium features.</p>
      <p><a href="{{dashboardUrl}}" class="button">View Dashboard</a></p>
      <p>Thank you for your continued support!</p>
      <p>If you have any questions about this renewal, contact us at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Great news! Your {{planName}} subscription has been successfully renewed.

Renewal Details:
Plan: {{planName}}
Amount Charged: {{amount}}
Transaction ID: {{transactionId}}
Next Renewal: {{expiresAt}}

Your subscription will continue uninterrupted, and you'll have access to all premium features.

View your dashboard: {{dashboardUrl}}

Thank you for your continued support!

If you have any questions about this renewal, contact us at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        planName: 'Subscription plan name',
        amount: 'Renewal amount',
        transactionId: 'Transaction identifier',
        expiresAt: 'Next renewal date',
        dashboardUrl: 'Link to dashboard',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_renewal_reminder',
      name: 'Subscription Renewal Reminder',
      description: 'Sent before an upcoming renewal when the provider signals an upcoming invoice',
      subject: '{{siteName}}: {{planName}} renews soon',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f8fafc; }
    .container { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
    .brand { text-align: center; padding: 16px 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); background: white; }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 26px; }
    .content { padding: 28px; }
    .pill { display: inline-block; padding: 6px 12px; background: #e0f2fe; color: #0369a1; border-radius: 999px; font-weight: 600; font-size: 12px; letter-spacing: 0.03em; }
    .summary { margin: 22px 0; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; background: #f9fafb; }
    .summary strong { display: block; margin-bottom: 6px; color: #111827; }
    .cta { display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; padding: 12px 26px; border-radius: 999px; text-decoration: none; font-weight: 600; margin-top: 18px; }
    .footer { text-align: center; margin: 28px 0 6px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <div class="pill">Renewal Notice</div>
        <h1>Your plan renews soon</h1>
      </div>
      <div class="content">
        <p>Hi {{firstName}},</p>
        <p>Your <strong>{{planName}}</strong> subscription is scheduled to renew shortly. You don’t need to do anything, but you can review your plan or update payment details anytime.</p>
        <div class="summary">
          <strong>Renewal details</strong>
          <div>Plan: {{planName}}</div>
          <div>Upcoming charge: {{amount}}</div>
          <div>Renews on: {{expiresAt}}</div>
        </div>
        <a href="{{billingUrl}}" class="cta">Manage billing</a>
        <p style="margin-top: 16px;">Need changes? You can switch plans or cancel renewal before the date above.</p>
        <p>If you have questions, reach us at {{supportEmail}}.</p>
        <p>— The {{siteName}} Team</p>
      </div>
      <div class="footer">
        <p>&copy; {{siteName}}. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your {{planName}} subscription is scheduled to renew soon.

Renewal details:
Plan: {{planName}}
Upcoming charge: {{amount}}
Renews on: {{expiresAt}}

Manage billing: {{billingUrl}}

Need changes? You can switch plans or cancel renewal before the date above.

Questions? Email us at {{supportEmail}}.

— The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        planName: 'Subscription plan name',
        amount: 'Upcoming renewal amount',
        expiresAt: 'Renewal date',
        billingUrl: 'Link to billing/pricing page',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_downgraded',
      name: 'Subscription Downgraded',
      description: 'Sent when user downgrades to a cheaper recurring plan',
      subject: '{{siteName}}: Subscription Changed to {{planName}}',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .change-box { background: #f3f4f6; border-left: 4px solid #6b7280; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>📉 Subscription Updated</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Your subscription has been updated to the <strong>{{planName}}</strong> plan.</p>
      <div class="change-box">
        <strong>Plan Change:</strong><br>
        New Plan: {{planName}}<br>
        New Price: {{amount}}<br>
        Effective: {{startedAt}}<br>
        Next Billing: {{expiresAt}}
      </div>
      <p>Your new plan is now active. Please note that some features from your previous plan may no longer be available.</p>
      <p><a href="{{dashboardUrl}}" class="button">View Dashboard</a></p>
      <p>You can change your plan at any time from your account settings.</p>
      <p>If you have any questions, contact us at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your subscription has been updated to the {{planName}} plan.

Plan Change:
New Plan: {{planName}}
New Price: {{amount}}
Effective: {{startedAt}}
Next Billing: {{expiresAt}}

Your new plan is now active. Please note that some features from your previous plan may no longer be available.

View your dashboard: {{dashboardUrl}}

You can change your plan at any time from your account settings.

If you have any questions, contact us at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        planName: 'New plan name',
        amount: 'New plan price',
        startedAt: 'Effective date',
        expiresAt: 'Next billing date',
        dashboardUrl: 'Link to dashboard',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_upgraded_recurring',
      name: 'Subscription Upgraded (Recurring)',
      description: 'Sent when user upgrades to a more expensive recurring plan',
      subject: '{{siteName}}: Upgraded to {{planName}}',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .brand { text-align: center; padding: 24px 0 16px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .upgrade-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="header">
      <h1>🚀 Subscription Upgraded!</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Congratulations! Your subscription has been upgraded to <strong>{{planName}}</strong>.</p>
      <div class="upgrade-box">
        <strong>Upgrade Details:</strong><br>
        New Plan: {{planName}}<br>
        New Price: {{amount}}<br>
        Effective: {{startedAt}}<br>
        Next Billing: {{expiresAt}}
      </div>
      <p>You now have access to all the enhanced features included in your new plan!</p>
      <p><a href="{{dashboardUrl}}" class="button">Explore Features</a></p>
      <p>Thank you for upgrading and supporting {{siteName}}!</p>
      <p>If you have any questions, reach out to us at {{supportEmail}}.</p>
      <p>Best regards,<br>The {{siteName}} Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{siteName}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Congratulations! Your subscription has been upgraded to {{planName}}.

Upgrade Details:
New Plan: {{planName}}
New Price: {{amount}}
Effective: {{startedAt}}
Next Billing: {{expiresAt}}

You now have access to all the enhanced features included in your new plan!

Explore features: {{dashboardUrl}}

Thank you for upgrading and supporting {{siteName}}!

If you have any questions, reach out to us at {{supportEmail}}.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User\'s first name',
        planName: 'New plan name',
        amount: 'New plan price',
        startedAt: 'Effective date',
        expiresAt: 'Next billing date',
        dashboardUrl: 'Link to dashboard',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'password_reset',
      name: 'Password Reset',
      description: 'Sent when a user requests a password reset link',
      subject: '{{siteName}}: Reset Your Password',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 36px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0; opacity: 0.95; font-size: 16px; }
    .content { background: #ffffff; padding: 36px; }
    .cta-section { margin: 28px 0; text-align: center; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #9a3412; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>🔑 Password Reset</h1>
        <p>We received a request to reset your password</p>
      </div>
      <div class="content">
        <p>Hi {{firstName}},</p>
        <p>Someone (hopefully you) requested a password reset for your <strong>{{siteName}}</strong> account associated with <strong>{{userEmail}}</strong>.</p>
        <div class="cta-section">
          <a href="{{actionUrl}}" class="button">Reset My Password</a>
        </div>
        <div class="notice">
          <strong>⏱ This link expires in 1 hour.</strong> If you didn't request this, you can safely ignore this email — your password will remain unchanged.
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; font-size: 13px; color: #667eea;">{{actionUrl}}</p>
        <p style="margin-bottom: 0;">Best regards,<br><strong>The {{siteName}} Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; {{siteName}}. All rights reserved.</p>
        <p>You received this email because a password reset was requested for your account.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Someone requested a password reset for your {{siteName}} account ({{userEmail}}).

Reset your password: {{actionUrl}}

This link expires in 1 hour. If you didn't request this, you can safely ignore this email.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        userEmail: 'User email address',
        actionUrl: 'Password reset link',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'email_verification',
      name: 'Email Verification',
      description: 'Sent when a user needs to verify their email address',
      subject: '{{siteName}}: Verify Your Email Address',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 36px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0; opacity: 0.95; font-size: 16px; }
    .content { background: #ffffff; padding: 36px; }
    .cta-section { margin: 28px 0; text-align: center; }
    .button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .notice { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #065f46; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>✉️ Verify Your Email</h1>
        <p>One quick step to secure your account</p>
      </div>
      <div class="content">
        <p>Hi {{firstName}},</p>
        <p>Please verify that <strong>{{userEmail}}</strong> is your email address by clicking the button below.</p>
        <div class="cta-section">
          <a href="{{actionUrl}}" class="button">Verify Email Address</a>
        </div>
        <div class="notice">
          <strong>⏱ This link expires in 24 hours.</strong> If you didn't create an account on {{siteName}}, you can safely ignore this email.
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; font-size: 13px; color: #10b981;">{{actionUrl}}</p>
        <p style="margin-bottom: 0;">Best regards,<br><strong>The {{siteName}} Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; {{siteName}}. All rights reserved.</p>
        <p>You received this email because an account verification was requested.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Please verify your email address ({{userEmail}}) by clicking the link below:

{{actionUrl}}

This link expires in 24 hours. If you didn't create an account on {{siteName}}, you can safely ignore this email.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        userEmail: 'User email address',
        actionUrl: 'Email verification link',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'email_change_confirmation',
      name: 'Email Change Confirmation',
      description: 'Sent when a signed-in user requests to change their email address',
      subject: '{{siteName}}: Confirm Your New Email Address',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #7c3aed 100%); color: white; padding: 40px 36px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0; opacity: 0.95; font-size: 16px; }
    .content { background: #ffffff; padding: 36px; }
    .cta-section { margin: 28px 0; text-align: center; }
    .button { display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #7c3aed 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .notice { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #1d4ed8; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>📬 Confirm Your New Email</h1>
        <p>Finish updating the email address on your account</p>
      </div>
      <div class="content">
        <p>Hi {{firstName}},</p>
        <p>We received a request to change your {{siteName}} email from <strong>{{currentEmail}}</strong> to <strong>{{userEmail}}</strong>.</p>
        <div class="cta-section">
          <a href="{{actionUrl}}" class="button">Confirm New Email</a>
        </div>
        <div class="notice">
          <strong>⏱ This link expires in 24 hours.</strong> Your current email stays active until you confirm this change.
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; font-size: 13px; color: #2563eb;">{{actionUrl}}</p>
        <p style="margin-bottom: 0;">If you didn’t request this change, you can ignore this message and keep using your current email.</p>
      </div>
      <div class="footer">
        <p>&copy; {{siteName}}. All rights reserved.</p>
        <p>You received this email because an email change was requested for your account.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

We received a request to change your {{siteName}} email from {{currentEmail}} to {{userEmail}}.

Confirm your new email address here:
{{actionUrl}}

This link expires in 24 hours. Your current email stays active until you confirm.

If you didn't request this change, you can ignore this email.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        currentEmail: 'Current email address on file',
        userEmail: 'New email address',
        actionUrl: 'Email confirmation link',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'magic_link',
      name: 'Magic Link Sign-In',
      description: 'Sent when a user requests a passwordless sign-in link',
      subject: '{{siteName}}: Your Secure Sign-In Link',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%); color: white; padding: 40px 36px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0; opacity: 0.95; font-size: 16px; }
    .content { background: #ffffff; padding: 36px; }
    .cta-section { margin: 28px 0; text-align: center; }
    .button { display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .notice { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #5b21b6; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="{{siteLogo}}" alt="{{siteName}} logo" />
    </div>
    <div class="card">
      <div class="header">
        <h1>✨ Sign In Securely</h1>
        <p>Your passwordless sign-in link is ready</p>
      </div>
      <div class="content">
        <p>Hi {{firstName}},</p>
        <p>Use the secure button below to sign in to <strong>{{siteName}}</strong> with <strong>{{userEmail}}</strong>.</p>
        <div class="cta-section">
          <a href="{{actionUrl}}" class="button">Sign In to {{siteName}}</a>
        </div>
        <div class="notice">
          <strong>⏱ This link expires soon.</strong> If you didn't request this sign-in email, you can safely ignore it.
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; font-size: 13px; color: #7c3aed;">{{actionUrl}}</p>
        <p style="margin-bottom: 0;">Best regards,<br><strong>The {{siteName}} Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; {{siteName}}. All rights reserved.</p>
        <p>You received this email because a passwordless sign-in link was requested for your account.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Use this secure sign-in link to access your {{siteName}} account ({{userEmail}}):

{{actionUrl}}

This link expires soon. If you didn't request this sign-in email, you can safely ignore it.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        userEmail: 'User email address',
        actionUrl: 'Magic-link sign-in URL',
        siteName: 'Site name',
        supportEmail: 'Support email address',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'payment_failed',
      name: 'Payment Failed',
      description: 'Sent when a one-time payment or invoice payment fails',
      subject: '{{siteName}}: Payment Failed',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); color: white; padding: 40px 36px; text-align: center; }
    .content { background: #ffffff; padding: 36px; }
    .button { display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .cta-section { margin: 28px 0; text-align: center; }
    .notice { background: #fff7ed; border: 1px solid #fdba74; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #9a3412; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container"><div class="brand"><img src="{{siteLogo}}" alt="{{siteName}} logo" /></div><div class="card"><div class="header"><h1>⚠️ Payment Failed</h1><p>Action may be required to keep your account active</p></div><div class="content"><p>Hi {{firstName}},</p><p>We couldn't process your recent payment for <strong>{{siteName}}</strong>.</p><div class="notice"><strong>Reason:</strong> {{errorMessage}}</div><div class="cta-section"><a href="{{billingUrl}}" class="button">Update Billing</a></div><p>Please update your payment method to avoid service interruption.</p></div><div class="footer"><p>&copy; {{siteName}}. All rights reserved.</p></div></div></div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

We couldn't process your recent payment for {{siteName}}.

Reason: {{errorMessage}}

Update billing: {{billingUrl}}

Please update your payment method to avoid service interruption.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        errorMessage: 'Why the payment failed',
        billingUrl: 'Billing page URL',
        siteName: 'Site name',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'invoice_payment_failed',
      name: 'Invoice Payment Failed',
      description: 'Sent when a subscription invoice payment fails',
      subject: '{{siteName}}: Subscription Payment Failed',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%); color: white; padding: 40px 36px; text-align: center; }
    .content { background: #ffffff; padding: 36px; }
    .button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .cta-section { margin: 28px 0; text-align: center; }
    .notice { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #991b1b; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container"><div class="brand"><img src="{{siteLogo}}" alt="{{siteName}} logo" /></div><div class="card"><div class="header"><h1>💳 Subscription Payment Failed</h1><p>Your subscription is waiting for payment</p></div><div class="content"><p>Hi {{firstName}},</p><p>We were unable to process your latest subscription payment for <strong>{{siteName}}</strong>.</p><div class="notice">Update your payment method to restore smooth renewal and avoid losing access.</div><div class="cta-section"><a href="{{billingUrl}}" class="button">Manage Billing</a></div></div><div class="footer"><p>&copy; {{siteName}}. All rights reserved.</p></div></div></div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

We were unable to process your latest subscription payment for {{siteName}}.

Manage billing: {{billingUrl}}

Please update your payment method to avoid service interruption.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        billingUrl: 'Billing page URL',
        siteName: 'Site name',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'refund_processed',
      name: 'Refund Processed',
      description: 'Sent when a refund has been completed',
      subject: '{{siteName}}: Refund Processed',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); color: white; padding: 40px 36px; text-align: center; }
    .content { background: #ffffff; padding: 36px; }
    .notice { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #065f46; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container"><div class="brand"><img src="{{siteLogo}}" alt="{{siteName}} logo" /></div><div class="card"><div class="header"><h1>💸 Refund Processed</h1><p>Your refund has been completed</p></div><div class="content"><p>Hi {{firstName}},</p><p>We've processed your refund of <strong>{{amount}}</strong>.</p><div class="notice"><strong>Reason:</strong> {{reason}}</div><p>The funds may take a few business days to appear depending on your bank or payment provider.</p></div><div class="footer"><p>&copy; {{siteName}}. All rights reserved.</p></div></div></div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

We've processed your refund of {{amount}}.

Reason: {{reason}}

Funds may take a few business days to appear depending on your bank or payment provider.

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        amount: 'Refund amount',
        reason: 'Refund reason',
        siteName: 'Site name',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    },
    {
      key: 'subscription_ended',
      name: 'Subscription Ended',
      description: 'Sent when a scheduled subscription reaches its end date',
      subject: '{{siteName}}: Subscription Ended',
      active: true,
      htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933; background: #f5f7fb; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 20px; }
    .brand { text-align: center; padding: 0 0 20px; }
    .brand img { max-height: 56px; width: auto; display: inline-block; }
    .card { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 35px -24px rgba(15,23,42,0.65); }
    .header { background: linear-gradient(135deg, #64748b 0%, #334155 100%); color: white; padding: 40px 36px; text-align: center; }
    .content { background: #ffffff; padding: 36px; }
    .button { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .cta-section { margin: 28px 0; text-align: center; }
    .notice { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #334155; }
    .footer { text-align: center; font-size: 12px; color: #6c7a89; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container"><div class="brand"><img src="{{siteLogo}}" alt="{{siteName}} logo" /></div><div class="card"><div class="header"><h1>📅 Subscription Ended</h1><p>Your plan has ended as scheduled</p></div><div class="content"><p>Hi {{firstName}},</p><p>Your <strong>{{planName}}</strong> subscription has ended as scheduled.</p><div class="notice">You can renew or choose a new plan whenever you're ready.</div><div class="cta-section"><a href="{{billingUrl}}" class="button">View Plans</a></div></div><div class="footer"><p>&copy; {{siteName}}. All rights reserved.</p></div></div></div>
</body>
</html>
      `,
      textBody: `Hi {{firstName}},

Your {{planName}} subscription has ended as scheduled.

View plans: {{billingUrl}}

Best regards,
The {{siteName}} Team`,
      variables: JSON.stringify({
        firstName: 'User first name',
        planName: 'Subscription plan name',
        billingUrl: 'Billing or pricing page URL',
        siteName: 'Site name',
        siteLogo: 'URL of the site logo image displayed at the top of the email'
      })
    }
  ];
}

/**
 * Seed default templates into the database
 */
export async function seedDefaultTemplates() {
  const templates = getDefaultTemplates();
  let created = 0;
  let skipped = 0;
  
  for (const template of templates) {
    try {
      const existing = await prisma.emailTemplate.findUnique({
        where: { key: template.key }
      });
      
      if (existing) {
        skipped++;
        Logger.info('Email template already exists, skipping', { key: template.key });
        continue;
      }
      
      await prisma.emailTemplate.create({ data: template });
      created++;
      Logger.info('Created email template', { key: template.key });
    } catch (err: unknown) {
      const e = toError(err);
      Logger.error('Failed to seed email template', { 
        key: template.key, 
        error: e.message 
      });
    }
  }
  
  Logger.info('Email template seeding complete', { created, skipped });
  return { created, skipped };
}
