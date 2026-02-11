import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../lib/auth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrModerator('notifications');

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    if (query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search users by email or name
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query } },
          { name: { contains: query } }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true
      },
      take: 10
    });

    // Parse name into firstName and lastName for display
    return NextResponse.json({
      users: users.map(u => {
        const nameParts = (u.name || '').split(' ');
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || ''
        };
      })
    });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
