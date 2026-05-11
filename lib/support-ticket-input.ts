import { z } from 'zod';
import { SUPPORT_TICKET_CATEGORIES, normalizeSupportTicketCategory, type SupportTicketCategory } from './support-ticket-categories';

export const SUPPORT_TICKET_SUBJECT_MAX_LENGTH = 200;
export const SUPPORT_TICKET_MESSAGE_MIN_LENGTH = 10;
export const SUPPORT_TICKET_MESSAGE_MAX_LENGTH = 5000;
export const SUPPORT_TICKET_REPLY_MESSAGE_MAX_LENGTH = 5000;

const SUPPORT_MESSAGE_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeSupportSubject(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  return raw
    .replace(/\0/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function sanitizeSupportMessage(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  return raw
    .replace(SUPPORT_MESSAGE_CONTROL_CHARS, '')
    .replace(/\r\n|\r/g, '\n')
    .trim();
}

export const supportTicketCreateSchema = z.object({
  subject: z.string().min(1).max(SUPPORT_TICKET_SUBJECT_MAX_LENGTH),
  message: z.string().min(SUPPORT_TICKET_MESSAGE_MIN_LENGTH).max(SUPPORT_TICKET_MESSAGE_MAX_LENGTH),
  category: z.enum(SUPPORT_TICKET_CATEGORIES).default('GENERAL'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});

export const supportTicketReplySchema = z.object({
  message: z.string().min(1).max(SUPPORT_TICKET_REPLY_MESSAGE_MAX_LENGTH),
});

export function parseSupportTicketCreateInput(input: unknown) {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return supportTicketCreateSchema.safeParse({
    subject: sanitizeSupportSubject(source.subject),
    message: sanitizeSupportMessage(source.message),
    category: normalizeSupportTicketCategory(source.category),
  });
}

export function parseSupportTicketReplyInput(input: unknown) {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return supportTicketReplySchema.safeParse({
    message: sanitizeSupportMessage(source.message),
  });
}

export function getSupportTicketValidationIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}

export function getDefaultSupportTicketCategory(): SupportTicketCategory {
  return 'GENERAL';
}