export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '@/lib/auth'

function debugRouteDisabled() {
  return process.env.NODE_ENV === 'production' || process.env.ENABLE_DEBUG_ROUTES !== 'true'
}

export async function POST() {
  if (debugRouteDisabled()) {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  try {
    await requireAdminOrModerator()

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
    const authResponse = toAuthGuardErrorResponse(err)
    if (authResponse) return authResponse
    console.error('debug trigger failed', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
