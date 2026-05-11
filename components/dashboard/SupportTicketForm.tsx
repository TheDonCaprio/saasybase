'use client';

import { useState } from 'react';
import { SUPPORT_TICKET_CATEGORIES, SUPPORT_TICKET_CATEGORY_LABELS, type SupportTicketCategory } from '../../lib/support-ticket-categories';
import {
  SUPPORT_TICKET_MESSAGE_MAX_LENGTH,
  SUPPORT_TICKET_MESSAGE_MIN_LENGTH,
  SUPPORT_TICKET_SUBJECT_MAX_LENGTH,
} from '../../lib/support-ticket-input';

interface SupportTicketFormProps {
  userId: string;
  subject: string;
  message: string;
  category: SupportTicketCategory;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onCategoryChange: (value: SupportTicketCategory) => void;
  onSuccess?: () => void;
}

export function SupportTicketForm({ userId, subject, message, category, onSubjectChange, onMessageChange, onCategoryChange, onSuccess }: SupportTicketFormProps) {
  // userId is intentionally unused on the client form; keep a void reference to silence lint in some builds
  void userId;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, category })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null) as { error?: string; issues?: string[] } | null;
        const messageToShow = error?.issues?.length ? error.issues.join(' · ') : error?.error || 'Failed to submit ticket';
        throw new Error(messageToShow);
      }

      onSubjectChange('');
      onMessageChange('');
      setSuccess(true);
      onSuccess?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error submitting ticket:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 bg-green-900/20 border border-green-700 rounded text-green-400">
        Support ticket submitted successfully! We&apos;ll get back to you soon.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage ? (
        <div className="rounded border border-red-700 bg-red-900/20 p-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium mb-2">Category</label>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value as SupportTicketCategory)}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
        >
          {SUPPORT_TICKET_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {SUPPORT_TICKET_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          maxLength={SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
          required
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
          placeholder="Brief description of the issue"
        />
        <div className="mt-1 text-xs text-neutral-500">
          {subject.length}/{SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Message</label>
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          required
          maxLength={SUPPORT_TICKET_MESSAGE_MAX_LENGTH}
          rows={6}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
          placeholder="Describe your issue in detail..."
        />
        <div className="mt-1 text-xs text-neutral-500">
          Minimum {SUPPORT_TICKET_MESSAGE_MIN_LENGTH} characters. {message.length}/{SUPPORT_TICKET_MESSAGE_MAX_LENGTH}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 text-white px-6 py-2 rounded transition-colors"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
      </button>
    </form>
  );
}
