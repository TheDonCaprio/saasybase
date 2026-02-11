import { NextResponse } from 'next/server';
import { syncUserFromClerk } from '../../../../lib/user-helpers';
import { requireAdmin } from '../../../../lib/auth';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    await requireAdmin();
    const user = await syncUserFromClerk();
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated or user not found' }, { status: 401 });
    }

    return NextResponse.json({ 
      message: 'User synced successfully',
      user,
      synced: true
    });
  } catch (error) {
    console.error('User sync error:', error);
    return NextResponse.json({ error: 'Sync failed', details: error }, { status: 500 });
  }
}
