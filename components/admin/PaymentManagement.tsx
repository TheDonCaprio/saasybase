'use client';

import { useState } from 'react';
import { AdminPayment, PaymentActionsPayment } from '@/lib/types/admin';
import { PaymentActions } from './PaymentActions';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { formatCurrency } from '../../lib/utils/currency';

interface PaymentManagementProps {
  payments: AdminPayment[];
  onStatsUpdate?: () => void;
}

export function PaymentManagement({ payments: initialPayments }: PaymentManagementProps) {
  const [payments, setPayments] = useState<AdminPayment[]>(initialPayments);
  const [filter, setFilter] = useState('');
  const settings = useFormatSettings();

  // Convert AdminPayment to PaymentActionsPayment for the actions component
  const convertToActionsPayment = (payment: AdminPayment): PaymentActionsPayment => ({
    id: payment.id,
    amountCents: payment.amountCents,
    status: payment.status,
    createdAt: payment.createdAt,
    subscription: payment.subscription ? {
      externalSubscriptionId: payment.subscription.externalSubscriptionId ?? null,
      stripeSubscriptionId: payment.subscription.stripeSubscriptionId ?? null,
      plan: {
        name: payment.subscription.plan.name
      }
    } : undefined,
    user: payment.user ? {
      email: payment.user.email
    } : undefined
  });

  const handlePaymentUpdate = (updatedPayment: PaymentActionsPayment) => {
    // Convert back to AdminPayment and update
    setPayments(prev => prev.map(p => {
      if (p.id === updatedPayment.id) {
        return {
          ...p,
          amountCents: updatedPayment.amountCents,
          status: updatedPayment.status,
          createdAt: updatedPayment.createdAt
        };
      }
      return p;
    }));
  };

  const filteredPayments = payments.filter((p: AdminPayment) => 
    !filter || 
    p.user?.email?.toLowerCase().includes(filter.toLowerCase()) ||
    p.subscription?.plan?.name?.toLowerCase().includes(filter.toLowerCase()) ||
    p.status.toLowerCase().includes(filter.toLowerCase())
  );

  const totalAmount = filteredPayments.reduce((sum: number, p: AdminPayment) => sum + p.amountCents, 0);
  const refundedAmount = filteredPayments
    .filter((p: AdminPayment) => p.status === 'REFUNDED')
    .reduce((sum: number, p: AdminPayment) => sum + p.amountCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Filter transactions..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm flex-1"
        />
        <div className="text-sm text-neutral-400 space-x-4">
          <span>{filteredPayments.length} transactions</span>
          <span>Total: {formatCurrency(totalAmount, 'usd')}</span>
          <span>Refunded: {formatCurrency(refundedAmount, 'usd')}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-neutral-800 rounded overflow-hidden">
          <thead className="bg-neutral-900 text-neutral-400 text-xs">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Plan</th>
              <th className="p-3 text-left">Amount</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((payment: AdminPayment) => (
              <tr key={payment.id} className="border-t border-neutral-800 hover:bg-neutral-900/60">
                <td className="p-3 text-xs text-neutral-500">
                  {formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                </td>
                <td className="p-3">
                  <div className="space-y-1">
                    <div className="text-sm">{payment.user?.email || 'Unknown'}</div>
                    <div className="font-mono text-xs text-neutral-500">{payment.userId.slice(0, 8)}</div>
                  </div>
                </td>
                <td className="p-3 text-sm">
                  {payment.subscription?.plan?.name || 'No plan'}
                </td>
                <td className="p-3 font-mono">
                  {formatCurrency(payment.amountCents, 'usd')}
                </td>
                <td className="p-3">
                  <PaymentActions 
                    payment={convertToActionsPayment(payment)} 
                    onPaymentUpdate={handlePaymentUpdate} 
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
    </div>
  );
}
