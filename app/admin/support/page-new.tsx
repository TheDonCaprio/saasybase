import { prisma } from '../../../lib/prisma';
import { AdminSupportTicketsList } from '../../../components/admin/AdminSupportTicketsList';

export default async function AdminSupportPage() {
  // Get initial page of tickets
  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const [tickets, totalCount] = await Promise.all([
    prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { email: true, name: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { email: true, name: true, role: true } } }
        }
      }
    }),
    prisma.supportTicket.count()
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support Management</h1>
        <div className="text-sm text-neutral-400">
          Total: {totalCount} tickets
        </div>
      </div>

      <AdminSupportTicketsList 
        initialTickets={tickets}
        initialTotalCount={totalCount}
        initialPage={page}
      />
      
      
    </div>
  );
}
