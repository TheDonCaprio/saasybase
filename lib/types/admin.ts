// Shared types for admin components

export interface AdminPayment {
  id: string;
  amountCents: number;
  amountFormatted?: string | null;
  subtotalCents?: number | null;
  subtotalFormatted?: string | null;
  discountCents?: number | null;
  discountFormatted?: string | null;
  couponCode?: string | null;
  currency?: string | null;
  status: string;
  createdAt: Date;
  userId: string;
  /** Payment provider identifier (e.g., 'stripe', 'paystack') */
  paymentProvider?: string | null;
  externalPaymentId?: string | null;
  externalSessionId?: string | null;
  externalRefundId?: string | null;
  dashboardUrl?: string | null;
  subscription?: {
    id: string;
    status: string;
    startedAt: Date;
    expiresAt: Date;
    canceledAt?: Date | null;
    externalSubscriptionId?: string | null;
    /** Payment provider for the subscription */
    paymentProvider?: string | null;
    plan: {
      id: string;
      name: string;
      description: string | null;
      autoRenew: boolean;
      externalPriceId?: string | null;
      active: boolean;
      durationHours: number;
      priceCents: number;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    };
  } | null;
  plan?: {
    id: string;
    name: string;
    description: string | null;
    autoRenew?: boolean | null;
  } | null;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
    imageUrl: string | null;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

// Simplified payment for actions component
export interface PaymentActionsPayment {
  id: string;
  amountCents: number;
  currency?: string | null;
  status: string;
  createdAt: Date;
  subscription?: {
    id?: string;
    status?: string;
    expiresAt?: Date | string | null;
    externalSubscriptionId?: string | null;
    plan: {
      name: string;
      autoRenew?: boolean | null;
    };
  };
  user?: {
    email: string | null;
  };
}
