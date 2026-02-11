import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint has moved to /api/admin/file/upload. Please update your client to use the new URL.'
    },
    { status: 410 }
  );
}
