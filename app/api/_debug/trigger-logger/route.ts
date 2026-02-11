export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Logger } from '@/lib/logger'

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  try {
    Logger.error('Manual debug trigger via /api/_debug/trigger-logger', { triggeredAt: new Date().toISOString() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('trigger-logger failed', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
