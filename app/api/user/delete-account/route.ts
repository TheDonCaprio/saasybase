import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { toError, asRecord } from '../../../../lib/runtime-guards';

export async function DELETE(_request: NextRequest) {
  void _request;
  try {
    const { userId } = await authService.getSession();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Start a transaction to delete all user-related data
    await prisma.$transaction(async (txParam: unknown) => {
      // Narrow the transactional client to a record and guard each table API before calling methods
      const txRec = asRecord(txParam) ?? {};

      const tryDeleteMany = async (tableName: string) => {
        const table = txRec[tableName];
        if (table && typeof table === 'object') {
          const maybeFn = (table as Record<string, unknown>)['deleteMany'];
          if (typeof maybeFn === 'function') {
            const fn = maybeFn as (...args: unknown[]) => Promise<unknown>;
            await fn({ where: { userId } });
          }
        }
      };

      await tryDeleteMany('userSetting');
      await tryDeleteMany('ticketReply');
      await tryDeleteMany('supportTicket');
      await tryDeleteMany('notification');
      await tryDeleteMany('featureUsageLog');
      await tryDeleteMany('payment');
      await tryDeleteMany('subscription');

      // Finally, delete the user record if available
      const userTable = txRec['user'];
      if (userTable && typeof userTable === 'object') {
        const del = (userTable as Record<string, unknown>)['delete'];
        if (typeof del === 'function') {
          const fn = del as (...args: unknown[]) => Promise<unknown>;
          await fn({ where: { id: userId } });
        }
      }
    });

    return NextResponse.json({ success: true, message: 'Account data deleted successfully' });
  } catch (error: unknown) {
    console.error('Account deletion error:', toError(error));
    return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 });
  }
}
