import { describe, expect, it } from 'vitest';

import { buildProrationSuccessMessage } from '../components/pricing/proration-feedback';

describe('buildProrationSuccessMessage', () => {
  it('surfaces awaiting payment confirmation for provisional Paystack switch-now responses', () => {
    const result = buildProrationSuccessMessage({
      pendingConfirmation: true,
      newPlanName: 'Pro',
      actualAmountCharged: null,
      formatPrice: (amountCents) => `$${(amountCents / 100).toFixed(2)}`,
    });

    expect(result).toEqual({
      message: 'Awaiting payment confirmation for Pro. Your switch will activate once Paystack confirms the charge.',
      tone: 'info',
    });
  });

  it('keeps the existing charged success message for confirmed switches', () => {
    const result = buildProrationSuccessMessage({
      pendingConfirmation: false,
      newPlanName: 'Pro',
      actualAmountCharged: 2500,
      formatPrice: (amountCents) => `$${(amountCents / 100).toFixed(2)}`,
    });

    expect(result).toEqual({
      message: 'Subscription changed to Pro. Charged: $25.00',
      tone: 'success',
    });
  });
});