/**
 * User Registration API Route (NextAuth)
 * =========================================
 * Creates a new user with email + password.
 * Only used when AUTH_PROVIDER=nextauth (Clerk handles its own registration).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/nextauth.config';
import { sendWelcomeIfNotSent } from '@/lib/welcome';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (typeof password === 'string' && password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    // Create the user
    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: hashed,
        role: 'USER',
        emailVerified: new Date(), // Auto-verify for credentials sign-up
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
