export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  try {
    const entry = await prisma.systemLog.create({
      data: {
        level: 'error',
        message: 'Manual debug trigger from /api/_debug/trigger-log',
        meta: JSON.stringify({ source: 'debug-endpoint' }),
        context: JSON.stringify({ time: new Date().toISOString() }),
      }
    })

    return NextResponse.json({ ok: true, id: entry.id })
  } catch (err) {
    console.error('debug trigger failed', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
