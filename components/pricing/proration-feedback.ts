export function buildProrationSuccessMessage(params: {
  pendingConfirmation: boolean;
  newPlanName: string;
  actualAmountCharged: number | null;
  formatPrice: (amountCents: number) => string;
}): { message: string; tone: 'success' | 'info' } {
  if (params.pendingConfirmation) {
    return {
      message: `Awaiting payment confirmation for ${params.newPlanName}. Your switch will activate once Paystack confirms the charge.`,
      tone: 'info',
    };
  }

  if (params.actualAmountCharged !== null) {
    return {
      message: `Subscription changed to ${params.newPlanName}. Charged: ${params.formatPrice(params.actualAmountCharged)}`,
      tone: 'success',
    };
  }

  return {
    message: `Subscription changed to ${params.newPlanName} successfully.`,
    tone: 'success',
  };
}