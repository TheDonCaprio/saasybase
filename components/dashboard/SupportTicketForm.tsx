'use client';

import { useState } from 'react';

interface SupportTicketFormProps {
  userId: string;
  onSuccess?: () => void;
}

export function SupportTicketForm({ userId, onSuccess }: SupportTicketFormProps) {
  // userId is intentionally unused on the client form; keep a void reference to silence lint in some builds
  void userId;
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message })
      });

      if (!response.ok) throw new Error('Failed to submit ticket');

      setSubject('');
      setMessage('');
      setSuccess(true);
  onSuccess?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error submitting ticket:', error);
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
      <div>
        <label className="block text-sm font-medium mb-2">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
          placeholder="Brief description of the issue"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={6}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
          placeholder="Describe your issue in detail..."
        />
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
