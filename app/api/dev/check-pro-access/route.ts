import { NextResponse } from 'next/server';
import { getAuthSafe, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    await requireAdmin();
    const auth = await getAuthSafe();
    const userId = auth?.userId;
    
    if (!userId) {
      return NextResponse.json({ 
        hasAccess: false, 
        reason: 'Not authenticated' 
      });
    }

    // Check for active subscription
    const activeSubscription = await prisma.subscription.findFirst({
      where: { 
        userId, 
        status: 'ACTIVE', 
        expiresAt: { gt: new Date() } 
      },
      include: { plan: true }
    });

    if (activeSubscription) {
      return NextResponse.json({ 
        hasAccess: true, 
        subscription: {
          plan: activeSubscription.plan.name,
          expiresAt: activeSubscription.expiresAt,
          status: activeSubscription.status
        }
      });
    } else {
      return NextResponse.json({ 
        hasAccess: false, 
        reason: 'No active subscription' 
      });
    }

  } catch (error) {
    console.error('Pro access check error:', error);
    return NextResponse.json({ 
      hasAccess: false, 
      reason: 'Error checking access',
      error: String(error)
    }, { status: 500 });
  }
}
