import { getSupportEmail } from './settings';

type SuspensionRecord = {
  suspendedAt?: Date | null;
  suspensionReason?: string | null;
  suspensionIsPermanent?: boolean | null;
};

export type UserSuspensionStatus = {
  isSuspended: boolean;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  suspensionIsPermanent: boolean;
};

export type OrganizationSuspensionStatus = {
  isSuspended: boolean;
  suspendedAt: Date | null;
  suspensionReason: string | null;
};

export function getUserSuspensionStatus(record: SuspensionRecord | null | undefined): UserSuspensionStatus {
  const suspendedAt = record?.suspendedAt instanceof Date ? record.suspendedAt : null;
  return {
    isSuspended: suspendedAt !== null,
    suspendedAt,
    suspensionReason: typeof record?.suspensionReason === 'string' && record.suspensionReason.trim().length > 0
      ? record.suspensionReason.trim()
      : null,
    suspensionIsPermanent: record?.suspensionIsPermanent === true,
  };
}

export function getOrganizationSuspensionStatus(record: Pick<SuspensionRecord, 'suspendedAt' | 'suspensionReason'> | null | undefined): OrganizationSuspensionStatus {
  const suspendedAt = record?.suspendedAt instanceof Date ? record.suspendedAt : null;
  return {
    isSuspended: suspendedAt !== null,
    suspendedAt,
    suspensionReason: typeof record?.suspensionReason === 'string' && record.suspensionReason.trim().length > 0
      ? record.suspensionReason.trim()
      : null,
  };
}

export function getUserSuspensionErrorCode(status: Pick<UserSuspensionStatus, 'suspensionIsPermanent'>): string {
  return status.suspensionIsPermanent ? 'USER_SUSPENDED_PERMANENT' : 'USER_SUSPENDED_TEMPORARY';
}

export async function getUserSuspensionMessage(status: Pick<UserSuspensionStatus, 'suspensionIsPermanent'>): Promise<string> {
  const supportEmail = await getSupportEmail().catch(() => process.env.SUPPORT_EMAIL || 'support@saasybase.com');
  if (status.suspensionIsPermanent) {
    return `Your account has been permanently suspended. Contact ${supportEmail} if you believe this is a mistake.`;
  }
  return `Your account is temporarily suspended. Contact ${supportEmail} to restore access.`;
}

export async function getOrganizationSuspensionMessage(): Promise<string> {
  const supportEmail = await getSupportEmail().catch(() => process.env.SUPPORT_EMAIL || 'support@saasybase.com');
  return `This workspace is currently suspended. Contact ${supportEmail} for assistance.`;
}

export async function getUserSuspensionDetails(record: SuspensionRecord | null | undefined) {
  const status = getUserSuspensionStatus(record);
  return {
    ...status,
    code: getUserSuspensionErrorCode(status),
    message: await getUserSuspensionMessage(status),
  };
}