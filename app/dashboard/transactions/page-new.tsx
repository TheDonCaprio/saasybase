import { prisma } from '../../../lib/prisma';
import { PaginatedTransactionList } from '../../../components/dashboard/PaginatedTransactionList';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/transactions', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);

  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const [payments, totalCount, allPayments] = await Promise.all([
    prisma.payment.findMany({ 
      where: { userId }, 
      orderBy: { createdAt: 'desc' }, 
      skip,
      take: limit,
      include: { 
        subscription: { 
          include: { plan: true }
        } 
      }
    }),
    prisma.payment.count({ where: { userId } }),
    prisma.payment.findMany({
      where: { userId },
      select: { amountCents: true }
    })
  ]);

  const totalSpent = allPayments.reduce((sum, p) => sum + p.amountCents, 0);
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Transaction History</h1>
        <div className="text-sm text-neutral-400">
          Total: {totalCount} transactions
        </div>
      </div>
      
      {totalCount === 0 ? (
        <div className="text-center py-12 border border-neutral-700 rounded">
          <div className="text-neutral-500 mb-4">No transactions yet</div>
          <a 
            href="/pricing" 
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            Get Pro Access
          </a>
        </div>
      ) : (
        <PaginatedTransactionList 
          initialPayments={payments}
          initialTotalCount={totalCount}
          initialPage={page}
          initialTotalSpent={totalSpent}
        />
      )}
      
      
    </div>
  );
}
