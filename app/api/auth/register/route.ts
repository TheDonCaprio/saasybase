/**
 * User Registration API Route (NextAuth)
 * =========================================
 * Creates a new user with email + password.
 * Only used when AUTH_PROVIDER=nextauth (Clerk handles its own registration).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/nextauth.config';
import { sendWelcomeIfNotSent } from '@/lib/welcome';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';
import { validatePasswordStrength } from '@/lib/password-policy';

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:register:${ip}`, RATE_LIMITS.AUTH, {
      ip,
      route: '/api/auth/register',
      method: 'POST',
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { name, email: rawEmail, password } = body;

    if (!rawEmail || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Normalize email
    const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : '';
    if (!email) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    // Validate password strength
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.message }, { status: 400 });
    }

    // Check if user already exists — use generic message to prevent email enumeration
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Unable to create account. Please try a different email or sign in.' }, { status: 409 });
    }

    // Create the user (emailVerified: null — require verification)
    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: hashed,
        role: 'USER',
        emailVerified: null,
      },
    });

    // Fire welcome email (async, non-blocking)
    sendWelcomeIfNotSent(user.id, email, { firstName: name?.split(' ')[0] }).catch(() => {});

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    console.error('Registration failed:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
