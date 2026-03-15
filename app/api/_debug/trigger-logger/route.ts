export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Logger } from '@/lib/logger'
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

    Logger.error('Manual debug trigger via /api/_debug/trigger-logger', { triggeredAt: new Date().toISOString() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const authResponse = toAuthGuardErrorResponse(err)
    if (authResponse) return authResponse
    console.error('trigger-logger failed', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
