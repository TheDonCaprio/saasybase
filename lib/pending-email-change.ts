import { authService } from '@/lib/auth-provider';
import {
  type BetterAuthPendingEmailChange,
  cancelBetterAuthPendingEmailChange,
  getBetterAuthPendingEmailChangeForUser,
} from '@/lib/better-auth-email-change';
import {
  type PendingEmailChange,
  cancelPendingEmailChange,
  getPendingEmailChangeForUser,
} from '@/lib/nextauth-email-verification';

export type ActiveProviderPendingEmailChange = PendingEmailChange | BetterAuthPendingEmailChange;

export function supportsManagedPendingEmailChange(providerName = authService.providerName): boolean {
  return providerName === 'nextauth' || providerName === 'betterauth';
}

export async function getPendingEmailChangeForActiveProvider(userId: string): Promise<ActiveProviderPendingEmailChange | null> {
  if (authService.providerName === 'betterauth') {
    return getBetterAuthPendingEmailChangeForUser(userId);
  }

  if (authService.providerName === 'nextauth') {
    return getPendingEmailChangeForUser(userId);
  }

  return null;
}

export async function cancelPendingEmailChangeForActiveProvider(userId: string) {
  if (authService.providerName === 'betterauth') {
    return cancelBetterAuthPendingEmailChange(userId);
  }

  if (authService.providerName === 'nextauth') {
    return cancelPendingEmailChange(userId);
  }

  return null;
}