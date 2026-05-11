import { describe, expect, it } from 'vitest';
import {
  SUPPORT_TICKET_MESSAGE_MAX_LENGTH,
  SUPPORT_TICKET_SUBJECT_MAX_LENGTH,
  parseSupportTicketCreateInput,
  parseSupportTicketReplyInput,
  sanitizeSupportMessage,
} from '../lib/support-ticket-input';

describe('support-ticket-input', () => {
  it('rejects overlong support ticket submissions instead of silently truncating them', () => {
    const result = parseSupportTicketCreateInput({
      subject: 'a'.repeat(SUPPORT_TICKET_SUBJECT_MAX_LENGTH + 1),
      message: 'b'.repeat(SUPPORT_TICKET_MESSAGE_MAX_LENGTH + 1),
      category: 'GENERAL',
    });

    expect(result.success).toBe(false);
  });

  it('rejects overlong user replies instead of silently truncating them', () => {
    const result = parseSupportTicketReplyInput({
      message: 'b'.repeat(SUPPORT_TICKET_MESSAGE_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
  });

  it('preserves script-like text as plain content while stripping control characters', () => {
    const sanitized = sanitizeSupportMessage('Hello\u0000<script>alert(1)</script>');
    expect(sanitized).toBe('Hello<script>alert(1)</script>');
  });
});