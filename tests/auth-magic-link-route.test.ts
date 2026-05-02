import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/auth/magic-link/route';

describe('GET /auth/magic-link', () => {
  it('redirects to the public forwarded callback origin instead of localhost', async () => {
    const request = new NextRequest('http://localhost:3000/auth/magic-link?token=token_123&email=user%40example.com&callbackUrl=https%3A%2F%2Fpublic-preview.example.test%2Fdashboard', {
      headers: {
        'x-forwarded-host': 'public-preview.example.test',
        'x-forwarded-proto': 'https',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://public-preview.example.test/api/auth/callback/nodemailer?token=token_123&email=user%40example.com&callbackUrl=https%3A%2F%2Fpublic-preview.example.test%2Fdashboard');
  });
});