"use client";

import { useState } from 'react';
import { showToast } from '../ui/Toast';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
// ...SupportTicketModal is intentionally not used in this legacy component

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string | Date;
  user: {
    email: string | null;
    name: string | null;
  } | null;
  replies: Array<{
    id: string;
    message: string;
    createdAt: string | Date;
    user: {
      email: string | null;
      role: string;
    } | null;
  }>;
}

interface AdminCompactSupportTicketProps {
  ticket: SupportTicket;
  onUpdate: () => void;
}

export function AdminCompactSupportTicket({ ticket, onUpdate }: AdminCompactSupportTicketProps) {
  const settings = useFormatSettings();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleReply = async () => {
    if (!replyMessage.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyMessage.trim() })
      });

      if (response.ok) {
        setReplyMessage('');
        setShowReplyForm(false);
        onUpdate();
        showToast('Reply sent successfully', 'success');
      } else {
        const error = await response.json();
        showToast(`Failed to send reply: ${error.error}`, 'error');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      showToast('Error sending reply', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        onUpdate();
        showToast(`Ticket status updated to ${newStatus}`, 'success');
      } else {
        const error = await response.json();
        showToast(`Failed to update status: ${error.error}`, 'error');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Error updating ticket status', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-red-600 text-white border-red-700';
      case 'IN_PROGRESS':
        return 'bg-yellow-900/20 border-yellow-700 text-yellow-400';
      case 'CLOSED':
        return 'bg-green-900/20 border-green-700 text-green-400';
      default:
        return 'bg-neutral-800 border-neutral-700 text-neutral-400';
    }
  };

  // use shared formatDate from lib/formatDate

  const isNewTicket = ticket.replies.length === 0;
  const lastReply = ticket.replies[ticket.replies.length - 1];
  const needsResponse = !lastReply || lastReply.user?.role !== 'ADMIN';

  return (
    <div className="border border-neutral-700 rounded">
      {/* Compact Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-neutral-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h4 className="font-medium truncate">{ticket.subject}</h4>
              <div className="flex gap-2 flex-wrap">
                {needsResponse && (
                  <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
                    Needs Response
                  </span>
                )}
                {isNewTicket && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
                    New
                  </span>
                )}
              </div>
            </div>
              <div className="text-xs text-neutral-500 mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="truncate">From: {ticket.user?.email || 'Unknown'}</span>
              <span className="whitespace-nowrap">{formatDate(ticket.createdAt, { mode: settings.mode, timezone: settings.timezone })}</span>
              <span className="whitespace-nowrap">{ticket.replies.length} replies</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between sm:justify-end gap-3">
            {/* Quick Status Actions */}
            <div className="flex gap-1 flex-wrap">
              {ticket.status !== 'IN_PROGRESS' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange('IN_PROGRESS');
                  }}
                  disabled={isUpdatingStatus}
                  className="text-xs px-2 py-1 rounded border border-yellow-700 text-yellow-400 hover:bg-yellow-900/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  In Progress
                </button>
              )}
              {ticket.status !== 'CLOSED' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange('CLOSED');
                  }}
                  disabled={isUpdatingStatus}
                  className="text-xs px-2 py-1 rounded border border-green-700 text-green-400 hover:bg-green-900/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  Close
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(ticket.status)} whitespace-nowrap`}>
                {ticket.status}
              </span>
              
              <svg 
                className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-neutral-700">
          {/* Original Message */}
          <div className="p-4 bg-neutral-900/20">
            <div className="text-xs text-neutral-500 mb-2">Original message:</div>
            <div className="text-sm whitespace-pre-wrap">{ticket.message}</div>
          </div>

          {/* Replies */}
          {ticket.replies.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              {ticket.replies.map((reply) => (
                <div key={reply.id} className="p-3 border-t border-neutral-700/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-xs font-medium ${
                      reply.user?.role === 'ADMIN' ? 'text-purple-400' : 'text-blue-400'
                    }`}>
                      {reply.user?.role === 'ADMIN' ? '🛠️ Support Team' : `👤 ${reply.user?.email || 'User'}`}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatDate(reply.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-300 whitespace-pre-wrap">{reply.message}</div>
                </div>
              ))}
            </div>
          )}

          {/* Reply Form */}
          {ticket.status !== 'CLOSED' && (
            <div className="p-4 border-t border-neutral-700 bg-neutral-900/20">
              {!showReplyForm ? (
                <button
                  onClick={() => setShowReplyForm(true)}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm font-medium"
                >
                  Reply to Ticket
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-neutral-300">Reply as Support Team:</div>
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your response..."
                    className="w-full h-24 px-3 py-2 bg-neutral-800 border border-neutral-600 rounded resize-none focus:outline-none focus:border-blue-500 text-sm"
                    disabled={isSubmitting}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowReplyForm(false);
                        setReplyMessage('');
                      }}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm border border-neutral-600 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReply}
                      disabled={!replyMessage.trim() || isSubmitting}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
