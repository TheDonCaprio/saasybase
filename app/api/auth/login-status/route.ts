import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
import { getUserSuspensionDetails } from '@/lib/account-suspension';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password. Please try again.';

function findCredentialAccount(accounts: NonNullable<Parameters<typeof ensureBetterAuthCredentialCompatibility>[0]['accounts']>) {
  const canonicalCredentialAccount = accounts.find((account) => account.provider === 'credential');
  if (canonicalCredentialAccount) {
    return canonicalCredentialAccount;
  }

  return accounts.find((account) => {
    return account.providerId === 'credential' || account.provider === 'credentials';
  });
}

async function ensureBetterAuthCredentialCompatibility(user: {
  id: string;
  password: string;
  emailVerified?: Date | null;
  emailVerifiedBool?: boolean;
  accounts?: Array<{
    id: string;
    type: string | null;
    provider: string | null;
    providerId: string | null;
    providerAccountId: string | null;
    accountId: string | null;
    password: string | null;
  }>;
}) {
  if (user.emailVerified && !user.emailVerifiedBool) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedBool: true },
    });
  }

  const credentialAccount = user.accounts ? findCredentialAccount(user.accounts) : undefined;

  if (!credentialAccount) {
    await prisma.account.create({
      data: {
        userId: user.id,
        type: 'credentials',
        provider: 'credential',
        providerAccountId: user.id,
        providerId: 'credential',
        accountId: user.id,
        password: user.password,
      },
    });
    return;
  }

  const data: {
    type?: string;
    provider?: string;
    providerAccountId?: string;
    providerId?: string;
    accountId?: string;
    password?: string;
  } = {};

  if (credentialAccount.type !== 'credentials') {
    data.type = 'credentials';
  }
  if (credentialAccount.provider !== 'credential') {
    data.provider = 'credential';
  }
  if (credentialAccount.providerAccountId !== user.id) {
    data.providerAccountId = user.id;
  }
  if (credentialAccount.providerId !== 'credential') {
    data.providerId = 'credential';
  }
  if (credentialAccount.accountId !== user.id) {
    data.accountId = user.id;
  }
  if (credentialAccount.password !== user.password) {
    data.password = user.password;
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.account.update({
    where: { id: credentialAccount.id },
    data,
  });
}

function buildOAuthOnlyMessage(providers: string[]) {
  const names = Array.from(new Set(providers))
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
    .map((provider) => provider === 'github' ? 'GitHub' : provider === 'google' ? 'Google' : provider);

  if (names.length === 0) {
    return 'This account uses social sign-in. Use the matching sign-in button instead of email and password.';
  }

  if (names.length === 1) {
    return `This account uses ${names[0]} sign-in. Use the ${names[0]} button instead of email and password.`;
  }

  const last = names[names.length - 1];
  return `This account uses ${names.slice(0, -1).join(', ')} or ${last} sign-in. Use one of those buttons instead of email and password.`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:login-status:${ip}`, RATE_LIMITS.AUTH, {
      ip,
      route: '/api/auth/login-status',
      method: 'POST',
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        emailVerified: true,
        emailVerifiedBool: true,
        suspendedAt: true,
        suspensionReason: true,
        suspensionIsPermanent: true,
        accounts: {
          select: {
            id: true,
            type: true,
            provider: true,
            providerId: true,
            providerAccountId: true,
            accountId: true,
            password: true,
          },
        },
      },
    });

    if (!user?.password) {
      const oauthProviders = (user?.accounts ?? [])
        .map((account) => account.provider)
        .filter((provider): provider is string => provider === 'github' || provider === 'google');

      if (oauthProviders.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            canSignIn: false,
            code: 'OAUTH_ACCOUNT_ONLY',
            error: buildOAuthOnlyMessage(oauthProviders),
            providers: oauthProviders,
          },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    }

    if (user.suspendedAt) {
      const suspension = await getUserSuspensionDetails(user);
      return NextResponse.json(
        {
          ok: false,
          canSignIn: false,
          code: suspension.code,
          error: suspension.message,
        },
        { status: 403 }
      );
    }

    const isBetterAuth = process.env.AUTH_PROVIDER === 'betterauth';

    if (isBetterAuth) {
      await ensureBetterAuthCredentialCompatibility({
        id: user.id,
        password: user.password,
        emailVerified: user.emailVerified,
        emailVerifiedBool: user.emailVerifiedBool,
        accounts: user.accounts,
      });
    }

    const emailVerified = isBetterAuth
      ? Boolean(user.emailVerifiedBool || user.emailVerified)
      : Boolean(user.emailVerified);

    if (emailVerified) {
      return NextResponse.json({ ok: true, canSignIn: true });
    }

    return NextResponse.json(
      {
        ok: false,
        canSignIn: false,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Your email is not verified.',
      },
      { status: 403 }
    );
  } catch (err) {
    Logger.error('Login status check failed', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}