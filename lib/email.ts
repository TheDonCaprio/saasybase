import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { prisma } from './prisma';
import { getSupportEmail as getSupportEmailSetting, getSiteLogo as getSiteLogoSetting, getSiteName as getSiteNameSetting, getThemeColorPalette, SETTING_DEFAULTS, SETTING_KEYS } from './settings';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { getRenderedTemplate, type EmailVariables } from './email-templates';

type EmailProviderName = 'nodemailer' | 'resend';

const SMTP_CONTROL_CHAR_PATTERN = /[\r\n]/;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

async function getResolvedSiteName(): Promise<string> {
	try {
		const siteName = await getSiteNameSetting();
		return siteName || process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
	} catch {
		return process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
	}
}

async function getResolvedSupportEmail(): Promise<string> {
	try {
		const supportEmail = await getSupportEmailSetting();
		return supportEmail || process.env.SUPPORT_EMAIL || SETTING_DEFAULTS[SETTING_KEYS.SUPPORT_EMAIL];
	} catch {
		return process.env.SUPPORT_EMAIL || SETTING_DEFAULTS[SETTING_KEYS.SUPPORT_EMAIL];
	}
}

async function getResolvedAccentColors(): Promise<{ accentColor: string; accentHoverColor: string }> {
	try {
		const palette = await getThemeColorPalette();
		return {
			accentColor: palette.light.accentPrimary || '#3b82f6',
			accentHoverColor: palette.light.accentHover || '#2563eb',
		};
	} catch {
		return { accentColor: '#3b82f6', accentHoverColor: '#2563eb' };
	}
}

function buildSiteBrandHtml(siteName: string, accentColor = '#3b82f6', accentHoverColor = '#2563eb'): string {
	const normalizedName = (siteName || 'YourApp').trim() || 'YourApp';
	const safeName = escapeHtml(normalizedName);
	const fontSize = normalizedName.length > 24 ? 22 : normalizedName.length > 16 ? 26 : 28;
	const width = Math.max(160, Math.min(400, normalizedName.length * (fontSize * 0.65)));
	const height = 36;

	return [
		'<div style="display:inline-block;line-height:1;">',
		`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${height}" viewBox="0 0 ${Math.round(width)} ${height}" role="img" aria-label="${safeName}">`,
		`<defs><linearGradient id="emailBrandGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${accentColor}" /><stop offset="100%" stop-color="${accentHoverColor}" /></linearGradient></defs>`,
		`<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="url(#emailBrandGradient)">${safeName}</text>`,
		'</svg>',
		'</div>',
	].join('');
}

export async function getSiteBrandHtml(): Promise<string> {
	const [name, { accentColor, accentHoverColor }] = await Promise.all([
		getResolvedSiteName(),
		getResolvedAccentColors(),
	]);
	return buildSiteBrandHtml(name, accentColor, accentHoverColor);
}

export async function getAccentColors(): Promise<{ accentColor: string; accentHoverColor: string }> {
	return getResolvedAccentColors();
}

export type SendEmailOptions = {
	to: string;
	subject?: string;
	text?: string;
	html?: string;
	userId?: string;
	template?: string | null;
	templateKey?: string;
	variables?: Partial<EmailVariables>;
	// Optional reply-to address for inbound replies
	replyTo?: string | null;
};

function buildGenericEmailFallback(params: {
	subject: string;
	variables?: Partial<EmailVariables>;
}) {
	const siteName = params.variables?.siteName?.trim() || 'Our team';
	const firstName = params.variables?.firstName?.trim() || 'there';
	const actionUrl = params.variables?.actionUrl?.trim();
	const actionText = params.variables?.actionText?.trim() || 'Open link';
	const supportEmail = params.variables?.supportEmail?.trim();
	const intro = `Hi ${firstName},`;
	const summary = `We are contacting you about: ${params.subject}`;
	const supportLine = supportEmail ? `Need help? Contact ${supportEmail}.` : undefined;

	const text = [
		intro,
		'',
		summary,
		...(actionUrl ? ['', `${actionText}: ${actionUrl}`] : []),
		...(supportLine ? ['', supportLine] : []),
		'',
		`The ${siteName} Team`,
	].join('\n');

	const htmlParts = [
		`<p>Hi ${escapeHtml(firstName)},</p>`,
		`<p>${escapeHtml(summary)}</p>`,
	];

	if (actionUrl) {
		htmlParts.push(`<p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionText)}</a></p>`);
	}

	if (supportLine) {
		htmlParts.push(`<p>${escapeHtml(supportLine)}</p>`);
	}

	htmlParts.push(`<p>The ${escapeHtml(siteName)} Team</p>`);

	return {
		text,
		html: htmlParts.join(''),
	};
}

function assertNoSmtpControlChars(value: string | null | undefined, label: string): string | undefined {
	if (value == null) return undefined;
	if (SMTP_CONTROL_CHAR_PATTERN.test(value)) {
		throw new Error(`${label} contains invalid control characters`);
	}
	return value;
}

function toSafeHostnameCandidate(value: string | null | undefined): string | null {
	const normalized = assertNoSmtpControlChars(value, 'SMTP client name source')?.trim().toLowerCase();
	if (!normalized) return null;

	try {
		const parsed = new URL(normalized);
		if (/^[a-z0-9.-]+$/i.test(parsed.hostname)) {
			return parsed.hostname;
		}
	} catch {
		if (/^[a-z0-9.-]+$/i.test(normalized)) {
			return normalized;
		}
	}

	return null;
}

function getSafeSmtpClientName(): string {
	return toSafeHostnameCandidate(process.env.NEXT_PUBLIC_APP_DOMAIN)
		|| toSafeHostnameCandidate(process.env.NEXTAUTH_URL)
		|| toSafeHostnameCandidate(process.env.NEXT_PUBLIC_APP_URL)
		|| 'localhost';
}

let cachedTransport: nodemailer.Transporter | null = null;
let cachedResend: Resend | null = null;

function getEmailProvider(): EmailProviderName {
	return process.env.EMAIL_PROVIDER?.trim().toLowerCase() === 'resend' ? 'resend' : 'nodemailer';
}

function createTransporter(): nodemailer.Transporter {
	const defaultHost = '127.0.0.1';
	const host = assertNoSmtpControlChars(process.env.SMTP_HOST || defaultHost, 'SMTP_HOST') || defaultHost;
	const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
	const user = assertNoSmtpControlChars(process.env.SMTP_USER || undefined, 'SMTP_USER');
	const pass = process.env.SMTP_PASS || undefined;
	const name = getSafeSmtpClientName();

	if (!host) {
		return nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true, disableFileAccess: true, disableUrlAccess: true });
	}

	return nodemailer.createTransport({
		host,
		name,
		port,
		secure: port === 465,
		auth: user && pass ? { user, pass } : undefined,
		disableFileAccess: true,
		disableUrlAccess: true,
		// Give slow local mail catchers (MailHog, Mailpit) time to respond
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 15_000,
	});
}

function getTransport(): nodemailer.Transporter {
	if (!cachedTransport) cachedTransport = createTransporter();
	return cachedTransport as nodemailer.Transporter;
}

function createResendClient(): Resend {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
	}

	return new Resend(apiKey);
}

function getResendClient(): Resend {
	if (!cachedResend) cachedResend = createResendClient();
	return cachedResend;
}

export async function getSupportEmail(): Promise<string> {
	return getResolvedSupportEmail();
}

export async function getSiteName(): Promise<string> {
	return getResolvedSiteName();
}

export async function getSiteLogo(): Promise<string> {
	try {
		const logo = await getSiteLogoSetting();
		const envLogo = process.env.NEXT_PUBLIC_SITE_LOGO;
		return logo || envLogo || '';
	} catch {
		return process.env.NEXT_PUBLIC_SITE_LOGO || '';
	}
}

export async function shouldEmailUser(userId: string): Promise<boolean> {
	try {
		const setting = await prisma.userSetting.findFirst({ where: { userId, key: 'EMAIL_NOTIFICATIONS' }, select: { value: true } });
		if (!setting) return true; // default: opted-in
		return setting.value !== 'false';
	} catch (err: unknown) {
		const e = toError(err);
		Logger.warn('shouldEmailUser error', { error: e.message });
		return true;
	}
}

function ensureSiteNameInSubject(subject: string | undefined, siteName: string | undefined): string | undefined {
	const normalizedSubject = subject?.trim();
	const normalizedSiteName = siteName?.trim();

	if (!normalizedSubject || !normalizedSiteName) {
		return normalizedSubject;
	}

	const lowerSubject = normalizedSubject.toLowerCase();
	const lowerSiteName = normalizedSiteName.toLowerCase();
	if (
		lowerSubject.startsWith(`${lowerSiteName}:`) ||
		lowerSubject.startsWith(`[${lowerSiteName}]`) ||
		lowerSubject.includes(normalizedSiteName)
	) {
		return normalizedSubject;
	}

	return `${normalizedSiteName}: ${normalizedSubject.replace(/^[:\-–—\s]+/, '')}`;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; error?: string | null }> {
	const from = process.env.EMAIL_FROM || `no-reply@${(process.env.NEXT_PUBLIC_APP_DOMAIN || 'example.com')}`;
	let status: 'SENT' | 'FAILED' = 'SENT';
	let errMsg: string | null = null;
	const fallbackSubject = opts.subject || opts.templateKey || opts.template || 'Notification';

	// Try to use template if templateKey is provided
	let subject = opts.subject;
	let text = opts.text;
	let html = opts.html;
	let templateVariables: Partial<EmailVariables> | undefined = opts.variables ? { ...opts.variables } : undefined;

	if (!templateVariables) {
		templateVariables = {};
	}

	if (!templateVariables.siteName) {
		templateVariables.siteName = await getResolvedSiteName();
	}

	if (!templateVariables.accentColor || !templateVariables.accentHoverColor) {
		const { accentColor, accentHoverColor } = await getResolvedAccentColors();
		if (!templateVariables.accentColor) templateVariables.accentColor = accentColor;
		if (!templateVariables.accentHoverColor) templateVariables.accentHoverColor = accentHoverColor;
	}

	if (opts.templateKey) {
		const tasks: Promise<void>[] = [];

		if (!templateVariables.siteName) {
			tasks.push(
				getResolvedSiteName()
					.then((value) => {
						templateVariables!.siteName = value;
					})
			);
		}

		if (!templateVariables.supportEmail) {
			tasks.push(
				getResolvedSupportEmail()
					.then((value) => {
						templateVariables!.supportEmail = value;
					})
			);
		}

		if (!templateVariables.siteLogo) {
			tasks.push(
				getSiteLogo()
					.then((value) => {
						templateVariables!.siteLogo = value;
					})
					.catch(() => {
						templateVariables!.siteLogo = '';
					})
			);
		}

		if (!templateVariables.siteBrandHtml) {
			tasks.push(
				getSiteBrandHtml()
					.then((value) => {
						templateVariables!.siteBrandHtml = value;
					})
					.catch(() => {
						templateVariables!.siteBrandHtml = buildSiteBrandHtml(
							templateVariables!.siteName || process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME],
							templateVariables!.accentColor,
							templateVariables!.accentHoverColor
						);
					})
			);
		}

		if (tasks.length > 0) {
			await Promise.all(tasks);
		}
	}

	if (opts.templateKey && templateVariables) {
		try {
			const rendered = await getRenderedTemplate(opts.templateKey, templateVariables as EmailVariables);
			if (rendered) {
				subject = rendered.subject;
				html = rendered.html;
				text = rendered.text || opts.text;
				Logger.info('Using email template', { templateKey: opts.templateKey });
			} else {
				Logger.info('Template not found or inactive, using fallback', {
					templateKey: opts.templateKey
				});
			}
		} catch (err: unknown) {
			const e = toError(err);
			Logger.warn('Template rendering failed, using fallback', {
				templateKey: opts.templateKey,
				error: e.message
			});
			// Continue with provided text/html as fallback
		}
	}

	if (!text && !html) {
		const fallback = buildGenericEmailFallback({
			subject: subject || fallbackSubject,
			variables: templateVariables,
		});
		text = fallback.text;
		html = fallback.html;
		Logger.info('Generated generic email fallback body', {
			templateKey: opts.templateKey || null,
		});
	}

	subject = ensureSiteNameInSubject(subject, templateVariables?.siteName);

	const provider = getEmailProvider();
	try {
		const safeFrom = assertNoSmtpControlChars(from, 'Email from') || from;
		const safeTo = assertNoSmtpControlChars(opts.to, 'Email recipient') || opts.to;
		const safeReplyTo = assertNoSmtpControlChars(opts.replyTo ?? undefined, 'Email replyTo');
		const safeSubject = assertNoSmtpControlChars(subject ?? fallbackSubject, 'Email subject') || fallbackSubject;

		if (provider === 'resend') {
			const resend = getResendClient();
			const resendOptions = {
				from: safeFrom,
				to: safeTo,
				subject: safeSubject,
				text,
				html,
				replyTo: safeReplyTo,
			} as Parameters<typeof resend.emails.send>[0];
			const result = await resend.emails.send(resendOptions);

			if (result.error) {
				throw new Error(result.error.message || 'Resend send failed');
			}
		} else {
			const transporter = getTransport();
			const mailOptions: nodemailer.SendMailOptions = { from: safeFrom, to: safeTo, subject: safeSubject, text, html };
			if (safeReplyTo) mailOptions.replyTo = safeReplyTo;
			await transporter.sendMail(mailOptions);
		}
		status = 'SENT';
	} catch (e: unknown) {
		const e1 = toError(e);
		errMsg = e1?.message || String(e);
		status = 'FAILED';
		Logger.warn('sendEmail failed', { to: opts.to, provider, error: errMsg });
	}

		try {
		// If a userId was provided, make sure the user exists locally before attempting
		// to write a foreign-key constrained EmailLog. If the user doesn't exist yet
		// (webhooks can arrive before local user creation), clear userId so the log
		// record still records the outbound email without failing the FK constraint.
		let persistedUserId: string | null = null;
		if (opts.userId) {
			try {
				const maybe = await prisma.user.findUnique({ where: { id: opts.userId }, select: { id: true } });
				if (maybe) persistedUserId = maybe.id;
			} catch {
				// ignore and fall through to null
			}
		}

		const data: Record<string, unknown> = {
				userId: persistedUserId,
				to: opts.to,
				subject: subject ?? fallbackSubject,
				template: opts.templateKey || opts.template,
				status,
				error: errMsg
		};
		// Localized cast at Prisma callsite - narrow at boundary
		// Prisma expects a specific input shape; cast to unknown then to the generated type to limit 'any' scope
		await prisma.emailLog.create({ data: data as unknown as Parameters<typeof prisma.emailLog.create>[0]['data'] });
		} catch (e: unknown) {
				const ee = toError(e);
				void ee;
				Logger.warn('Failed to write EmailLog', { error: ee.message });
		}

	return { success: status === 'SENT', error: errMsg };
}
