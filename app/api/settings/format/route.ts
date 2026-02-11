import { NextResponse } from 'next/server';
import { getFormatSetting } from '@/lib/settings';

export async function GET() {
  try {
    const format = await getFormatSetting();
    return NextResponse.json({ ok: true, ...format });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to load format settings' }, { status: 500 });
  }
}
