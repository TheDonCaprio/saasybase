'use client';

import { useState } from 'react';

interface SupportTicketActionsProps {
  ticketId: string;
  currentStatus: string;
}

export function SupportTicketActions({ ticketId, currentStatus }: SupportTicketActionsProps) {
  const [status, setStatus] = useState(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');

  const updateStatus = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        setStatus(newStatus);
      }
    } catch (error) {
      console.error('Error updating ticket status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;

    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyMessage })
      });

      if (response.ok) {
        setReplyMessage('');
        setShowReplyForm(false);
        window.location.reload(); // Refresh to show new reply
      }
    } catch (error) {
      console.error('Error submitting reply:', error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(e) => updateStatus(e.target.value)}
        disabled={isUpdating}
        className="text-xs px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
      >
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="CLOSED">Closed</option>
      </select>

      <button
        onClick={() => setShowReplyForm(!showReplyForm)}
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
      >
        Reply
      </button>

      {showReplyForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">Reply to Ticket</h3>
            <form onSubmit={submitReply} className="space-y-4">
              <textarea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                required
                rows={6}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                placeholder="Type your reply..."
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReplyForm(false)}
                  className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Send Reply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
