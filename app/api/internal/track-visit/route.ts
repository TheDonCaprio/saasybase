import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';

function getBearerToken(req: NextRequest): string | null {
  const bearer = req.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return null;
  const token = bearer.slice('Bearer '.length).trim();
  return token.length ? token : null;
}

function isInternalAuthorized(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_TOKEN || null;
  const bearer = getBearerToken(req);
  return Boolean(expected && bearer && bearer === expected);
}

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();
    
    const {
      sessionId,
      ip,
      userAgent,
      country,
      referrer,
      path
    } = data;

    await prisma.$executeRaw`
      INSERT INTO VisitLog (id, sessionId, ipAddress, userAgent, country, referrer, path, createdAt)
      VALUES (
        ${`visit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`},
        ${sessionId},
        ${ip},
        ${userAgent},
        ${country},
        ${referrer},
        ${path},
        ${new Date().toISOString()}
      )
    `;

    return NextResponse.json({ success: true });
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table')) {
      Logger.error('Visit tracking failed because VisitLog is missing; run migrations', error);
    }
    Logger.error('Visit tracking API error', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
