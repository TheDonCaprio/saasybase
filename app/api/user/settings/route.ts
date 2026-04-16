import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '@/lib/logger';

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await authService.getSession();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { key, value } = await request.json();
    
    // Whitelist of user-editable settings
    const allowedKeys = [
      'EMAIL_NOTIFICATIONS',
      'EXPORT_QUALITY',
      'THEME_PREFERENCE',
      'TIMEZONE'
    ];

    if (!allowedKeys.includes(key)) {
      return NextResponse.json({ error: 'Setting not editable' }, { status: 400 });
    }

    const setting = await prisma.userSetting.upsert({
      where: { 
        userId_key: { 
          userId: userId, 
          key 
        } 
      },
      update: { value },
      create: { 
        userId: userId, 
        key, 
        value 
      },
      select: { id: true, key: true, value: true }
    });

    return NextResponse.json({ success: true, setting });
  } catch (error) {
    Logger.error('User settings update error', error);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await authService.getSession();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await prisma.userSetting.findMany({
      where: { userId: userId },
      select: { id: true, key: true, value: true }
    });

    return NextResponse.json({ settings });
  } catch (error) {
    Logger.error('User settings fetch error', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}
