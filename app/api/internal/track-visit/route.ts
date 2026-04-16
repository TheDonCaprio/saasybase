import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  // Never expose in production without explicit secret
  if (process.env.NODE_ENV === 'production') {
    const bearer = request.headers.get('authorization') || '';
    const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : null;
    const expected = process.env.INTERNAL_API_TOKEN || null;
    if (!expected || token !== expected) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }
  try {
    // Back-compat dev header; keep for non-prod environments
    if (process.env.NODE_ENV !== 'production') {
      if (request.headers.get('X-Internal-API') !== 'true') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const data = await request.json();
    
    const {
      sessionId,
      ip,
      userAgent,
      country,
      referrer,
      path
    } = data;

    // Create visit record with error handling for table existence
    try {
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
    } catch (error) {
      // If table doesn't exist, create it first
      if (error instanceof Error && error.message.includes('no such table')) {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS VisitLog (
            id TEXT PRIMARY KEY,
            sessionId TEXT NOT NULL,
            userId TEXT,
            ipAddress TEXT,
            userAgent TEXT,
            country TEXT,
            city TEXT,
            referrer TEXT,
            path TEXT NOT NULL,
            createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES User (id) ON DELETE SET NULL
          )
        `;
        
        // Try inserting again
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
      } else {
        throw error;
      }
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    Logger.error('Visit tracking API error', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
