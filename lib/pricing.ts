import type { Plan } from '@prisma/client';
import { isRecurringPlan } from './settings';

type PlanRecord = Pick<Plan, 'autoRenew' | 'id'>;

type RecurringCheckInput = {
  prorationEnabled: boolean;
  plan: PlanRecord;
  activeRecurringPlan?: { planId: string | null } | null;
};

export function shouldUseProration(input: RecurringCheckInput): boolean {
  if (!input.prorationEnabled) return false;
  if (!isRecurringPlan(input.plan)) return false;
  const currentPlanId = input.activeRecurringPlan?.planId;
  if (!currentPlanId) return false;
  return currentPlanId !== input.plan.id;
}
