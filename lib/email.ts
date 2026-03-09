import nodemailer from 'nodemailer';
import { prisma } from './prisma';
import { getSupportEmail as getSupportEmailSetting, getSiteLogo as getSiteLogoSetting, getSiteName as getSiteNameSetting, SETTING_DEFAULTS, SETTING_KEYS } from './settings';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { getRenderedTemplate, type EmailVariables } from './email-templates';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

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
	return getSupportEmailSetting();
}

export async function getSiteName(): Promise<string> {
	return getSiteNameSetting();
}

export async function getSiteLogo(): Promise<string> {
	try {
		const logo = await getSiteLogoSetting();
		const envLogo = process.env.NEXT_PUBLIC_SITE_LOGO;
		return logo || envLogo || TRANSPARENT_PIXEL;
	} catch {
		return process.env.NEXT_PUBLIC_SITE_LOGO || TRANSPARENT_PIXEL;
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

	if (opts.templateKey) {
		if (!templateVariables) {
			templateVariables = {};
		}

		const tasks: Promise<void>[] = [];

		if (!templateVariables.siteName) {
			tasks.push(
				getSiteNameSetting()
					.then((value) => {
						templateVariables!.siteName = value || process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
					})
					.catch(() => {
						templateVariables!.siteName = process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
					})
			);
		}

		if (!templateVariables.supportEmail) {
			tasks.push(
				getSupportEmailSetting()
					.then((value) => {
						templateVariables!.supportEmail = value || process.env.SUPPORT_EMAIL || 'support@example.com';
					})
					.catch(() => {
						templateVariables!.supportEmail = process.env.SUPPORT_EMAIL || 'support@example.com';
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
						templateVariables!.siteLogo = TRANSPARENT_PIXEL;
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
