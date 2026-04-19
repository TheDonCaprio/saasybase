import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.hoisted(() => vi.fn(async () => ({ messageId: 'mail_123' })));
const createTransportMock = vi.hoisted(() => vi.fn(() => ({ sendMail: sendMailMock })));
const resendSendMock = vi.hoisted(() => vi.fn(async () => ({ data: { id: 'resend_123' }, error: null })));
const resendCtorMock = vi.hoisted(() => vi.fn(function () { return { emails: { send: resendSendMock } }; }));

const prismaMock = vi.hoisted(() => ({
	userSetting: { findFirst: vi.fn() },
	user: { findUnique: vi.fn(async () => ({ id: 'user_1' })) },
	emailLog: { create: vi.fn(async () => ({ id: 'log_1' })) },
}));

vi.mock('nodemailer', () => ({
	default: {
		createTransport: createTransportMock,
	},
}));

vi.mock('resend', () => ({
	Resend: resendCtorMock,
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/settings', () => ({
	getSupportEmail: vi.fn(async () => 'support@example.com'),
	getSiteLogo: vi.fn(async () => ''),
	getSiteName: vi.fn(async () => 'SaaSyBase'),
	getThemeColorPalette: vi.fn(async () => ({ light: { accentPrimary: '#3b82f6', accentHover: '#2563eb' } })),
	SETTING_DEFAULTS: { SITE_NAME: 'SaaSyBase', SUPPORT_EMAIL: 'support@example.com' },
	SETTING_KEYS: { SITE_NAME: 'SITE_NAME', SUPPORT_EMAIL: 'SUPPORT_EMAIL' },
}));
vi.mock('../lib/logger', () => ({
	Logger: {
		warn: vi.fn(),
		info: vi.fn(),
	},
}));
vi.mock('../lib/runtime-guards', () => ({
	toError: (value: unknown) => value instanceof Error ? value : new Error(String(value)),
}));
vi.mock('../lib/email-templates', () => ({
	getRenderedTemplate: vi.fn(async () => null),
}));

describe('email provider switching', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.EMAIL_PROVIDER;
		delete process.env.RESEND_API_KEY;
		process.env.EMAIL_FROM = 'support@example.com';
		process.env.NEXT_PUBLIC_APP_DOMAIN = 'example.com';
	});

	it('uses nodemailer by default', async () => {
		vi.resetModules();
		const { sendEmail } = await import('../lib/email');

		const result = await sendEmail({
			to: 'user@example.com',
			subject: 'Test email',
			text: 'Hello',
			userId: 'user_1',
		});

		expect(result.success).toBe(true);
		expect(createTransportMock).toHaveBeenCalledTimes(1);
		expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({
			host: '127.0.0.1',
			name: 'example.com',
			disableFileAccess: true,
			disableUrlAccess: true,
		}));
		expect(sendMailMock).toHaveBeenCalledTimes(1);
		expect(resendCtorMock).not.toHaveBeenCalled();
	});

	it('uses resend when EMAIL_PROVIDER=resend', async () => {
		process.env.EMAIL_PROVIDER = 'resend';
		process.env.RESEND_API_KEY = 're_test_key';
		vi.resetModules();
		const { sendEmail } = await import('../lib/email');

		const result = await sendEmail({
			to: 'user@example.com',
			subject: 'Resend email',
			html: '<p>Hello</p>',
			userId: 'user_1',
		});

		expect(result.success).toBe(true);
		expect(resendCtorMock).toHaveBeenCalledWith('re_test_key');
		expect(resendSendMock).toHaveBeenCalledWith({
			from: 'support@example.com',
			to: 'user@example.com',
			subject: 'SaaSyBase: Resend email',
			text: undefined,
			html: '<p>Hello</p>',
			replyTo: undefined,
		});
		expect(sendMailMock).not.toHaveBeenCalled();
	});

	it('rejects header control characters before attempting delivery', async () => {
		vi.resetModules();
		const { sendEmail } = await import('../lib/email');

		const result = await sendEmail({
			to: 'user@example.com',
			subject: 'Hello\r\nBCC: injected@example.com',
			text: 'Hello',
			userId: 'user_1',
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('Email subject contains invalid control characters');
		expect(sendMailMock).not.toHaveBeenCalled();
		expect(resendSendMock).not.toHaveBeenCalled();
	});
});