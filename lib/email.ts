import nodemailer from 'nodemailer';
import { prisma } from './prisma';
import { getSupportEmail as getSupportEmailSetting, getSiteLogo as getSiteLogoSetting, getSiteName as getSiteNameSetting, SETTING_DEFAULTS, SETTING_KEYS } from './settings';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { getRenderedTemplate, type EmailVariables } from './email-templates';

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

function buildSiteBrandHtml(siteName: string): string {
	const normalizedName = (siteName || 'YourApp').trim() || 'YourApp';
	const safeName = escapeHtml(normalizedName);
	const fontSize = normalizedName.length > 24 ? 26 : normalizedName.length > 16 ? 30 : 34;
	const width = Math.max(220, Math.min(520, normalizedName.length * (fontSize * 0.72)));

	return [
		'<div style="display:inline-block;line-height:1;">',
		`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="56" viewBox="0 0 ${Math.round(width)} 56" role="img" aria-label="${safeName}">`,
		'<defs><linearGradient id="emailBrandGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#7c3aed" /><stop offset="100%" stop-color="#2563eb" /></linearGradient></defs>',
		`<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-0.04em" fill="url(#emailBrandGradient)">${safeName}</text>`,
		'</svg>',
		'</div>',
	].join('');
}

export async function getSiteBrandHtml(): Promise<string> {
	return buildSiteBrandHtml(await getResolvedSiteName());
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

let cachedTransport: nodemailer.Transporter | null = null;

function createTransporter(): nodemailer.Transporter {
	const defaultHost = '::1';
	const host = process.env.SMTP_HOST || defaultHost;
	const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
	const user = process.env.SMTP_USER || undefined;
	const pass = process.env.SMTP_PASS || undefined;

	if (!host) {
		return nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
	}

	return nodemailer.createTransport({ host, port, secure: port === 465, auth: user && pass ? { user, pass } : undefined });
}

function getTransport(): nodemailer.Transporter {
	if (!cachedTransport) cachedTransport = createTransporter();
	return cachedTransport as nodemailer.Transporter;
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
						templateVariables!.siteBrandHtml = buildSiteBrandHtml(templateVariables!.siteName || process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);
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

	subject = ensureSiteNameInSubject(subject, templateVariables?.siteName);

	const transporter = getTransport();
	try {
		const mailOptions: nodemailer.SendMailOptions = { from, to: opts.to, subject, text, html };
		if (opts.replyTo) mailOptions.replyTo = opts.replyTo;
		await transporter.sendMail(mailOptions);
		status = 'SENT';
	} catch (e: unknown) {
		const e1 = toError(e);
		errMsg = e1?.message || String(e);
		status = 'FAILED';
		Logger.warn('sendEmail failed', { to: opts.to, error: errMsg });

		if (errMsg && errMsg.includes('Greeting never received') && (process.env.SMTP_HOST === '127.0.0.1' || process.env.SMTP_HOST === 'localhost')) {
			try {
				const alt = nodemailer.createTransport({ host: '::1', port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 1025, secure: false });
				await alt.sendMail({ from, to: opts.to, subject: subject ?? fallbackSubject, text, html });
				status = 'SENT';
				errMsg = null;
			} catch (e2: unknown) {
				const e2n = toError(e2);
				errMsg = e2n?.message || String(e2);
				status = 'FAILED';
				Logger.warn('sendEmail IPv6 retry failed', { to: opts.to, error: errMsg });
			}
		}
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
