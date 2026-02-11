"use client";

import { useState, useEffect } from 'react';
import { showToast } from '../ui/Toast';
import { SupportTeamIcon } from '../ui/SupportTeamIcon';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string | Date;
  createdByRole?: string;
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
      name: string | null;
      role: string;
    } | null;
  }>;
}

interface SupportTicketModalProps {
  ticket: SupportTicket | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function SupportTicketModal({ ticket, open, onClose, onUpdate }: SupportTicketModalProps) {
  const settings = useFormatSettings();
  void settings;
  void showToast;
  // local copy to allow polling/updates while modal is open
  const [localTicket, setLocalTicket] = useState<SupportTicket | null>(ticket);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    if (open) {
      setVisible(false);
      raf = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open]);

  // sync prop -> local when ticket changes
  useEffect(() => {
    setLocalTicket(ticket);
  }, [ticket]);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleReply = async () => {
    if (!replyMessage.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
  const response = await fetch(`/api/admin/support/tickets/${localTicket!.id}/reply`, {
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
      void error;
      console.error('Error sending reply:', error);
      showToast('Error sending reply', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
  const response = await fetch(`/api/admin/support/tickets/${localTicket!.id}`, {
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
      void error;
      console.error('Error updating status:', error);
      showToast('Error updating ticket status', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-red-600 text-white';
      case 'IN_PROGRESS':
        return 'bg-yellow-600 text-white';
      case 'CLOSED':
        return 'bg-green-600 text-actual-white';
      default:
        return 'bg-neutral-600 text-actual-white';
    }
  };

  

  // Poll ticket detail while modal is open so replies and status refresh automatically
  useEffect(() => {
    const ticketId = localTicket?.id;
    if (!open || !ticketId) return;
    const POLL_INTERVAL = 10000; // 10s

    const fetchTicket = async () => {
      try {
        const res = await fetch(`/api/admin/support/tickets/${ticketId}`);
        if (res.ok) {
          const data = await res.json();
          setLocalTicket((prev) => {
            if (!prev) {
              try { window.dispatchEvent(new CustomEvent('support:ticket-updated', { detail: { ticketId: data.id } })); } catch (e) { void e; }
              return data;
            }

            const prevLen = prev.replies.length;
            const dataLen = data.replies.length;
            const prevLast = prev.replies[prevLen - 1];
            const dataLast = data.replies[dataLen - 1];

            const repliesChanged = prevLen !== dataLen || (
              prevLast && dataLast && (
                prevLast.id !== dataLast.id || String(prevLast.createdAt) !== String(dataLast.createdAt)
              )
            );

            const statusChanged = prev.status !== data.status;

            if (repliesChanged || statusChanged) {
              try { window.dispatchEvent(new CustomEvent('support:ticket-updated', { detail: { ticketId: data.id } })); } catch (e) { void e; }
              return data;
            }
            return prev;
          });
        }
      } catch (e) {
        void e;
      }
    };

    fetchTicket();
    const intervalId = window.setInterval(fetchTicket, POLL_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [open, localTicket?.id]);

  // Guard after hooks so hooks order is stable
  if (!open || !localTicket) return null;

  const ticketIdLabel = `#${localTicket.id.slice(0, 12)}`;
  const senderName = localTicket.user?.name || localTicket.user?.email || 'Unknown User';
  const isClosed = localTicket.status === 'CLOSED';
  const isNewTicket = localTicket.replies.length === 0 && !isClosed;
  const lastReply = localTicket.replies[localTicket.replies.length - 1];
  const needsResponse = !isClosed && (!lastReply || lastReply.user?.role !== 'ADMIN');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      
      {/* Modal */}
      <div className={`bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl z-10 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transition-transform transition-opacity duration-150 ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.99]'}`}>
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-1 text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full" title={localTicket.id}>
                  {ticketIdLabel}
                </span>
                <h2 className="text-lg font-medium text-neutral-900 dark:text-white truncate">{localTicket.subject}</h2>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(localTicket.status)}`}>
                  {localTicket.status.replace('_', ' ')}
                </span>
                {needsResponse && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    Needs Response
                  </span>
                )}
                {isNewTicket && (
                  <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                    New
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>From: <span className="text-blue-600 dark:text-blue-400 font-medium">{senderName}</span></span>
                <span className="hidden sm:inline">•</span>
                <span>{formatDate(localTicket.createdAt, { mode: settings.mode, timezone: settings.timezone })}</span>
                <span className="hidden sm:inline">•</span>
                <span>{localTicket.replies.length} replies</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Action Buttons - Moved to top */}
          <div className="flex gap-2">
            {localTicket.status === 'CLOSED' ? (
              <button
                onClick={() => handleStatusChange('OPEN')}
                disabled={isUpdatingStatus}
                className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-800 text-white rounded-md transition-colors disabled:opacity-50"
              >
                Re-open Ticket
              </button>
            ) : (
              <>
                {localTicket.status !== 'IN_PROGRESS' && (
                  <button
                    onClick={() => handleStatusChange('IN_PROGRESS')}
                    disabled={isUpdatingStatus}
                    className="px-3 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors disabled:opacity-50"
                  >
                    Mark In Progress
                  </button>
                )}
                {localTicket.status !== 'CLOSED' && (
                  <button
                    onClick={() => handleStatusChange('CLOSED')}
                    disabled={isUpdatingStatus}
                    className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50"
                  >
                    Close Ticket
                  </button>
                )}
                {!showReplyForm && (
                  <button
                    onClick={() => setShowReplyForm(true)}
                    className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                  >
                    Reply
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Original Message */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-actual-white font-medium text-xs">
                  {senderName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-900 dark:text-white">{senderName}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatDate(localTicket.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                </div>
              </div>
            </div>
            <div className="prose prose-neutral max-w-none dark:prose-invert">
              <div className="whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed">
                {localTicket.message}
              </div>
            </div>
          </div>

          {/* Replies */}
          {localTicket.replies.map((reply, index) => {
            const userRole = reply.user?.role ?? 'USER';
            const isSupport = userRole !== 'USER';
            const replyAuthor = isSupport 
              ? `Support Team (${reply.user?.name || reply.user?.email || 'Admin'})`
              : (reply.user?.email || 'Unknown User');
            void index;
            return (
              <div key={reply.id} className={`p-4 border-t border-neutral-200 dark:border-neutral-700 ${isSupport ? 'bg-purple-50 dark:bg-purple-900/10' : 'bg-neutral-50 dark:bg-neutral-800/30'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-actual-white ${
                    isSupport 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-600' 
                      : 'bg-gradient-to-br from-blue-500 to-purple-600'
                  }`}>
                    {isSupport ? (
                      <SupportTeamIcon className="w-4 h-4" />
                    ) : (
                      <span className="font-medium text-xs">
                        {replyAuthor.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${isSupport ? 'text-purple-700 dark:text-purple-300' : 'text-blue-700 dark:text-blue-300'}`}>
                      {replyAuthor}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(reply.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                    </div>
                  </div>
                </div>
                <div className="prose prose-neutral max-w-none dark:prose-invert ml-11">
                  <div className="whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed">
                    {reply.message}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

  {/* Reply Form Footer */}
  {showReplyForm && localTicket.status !== 'CLOSED' && (
          <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-actual-white">
                  <SupportTeamIcon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Replying as Support Team</span>
              </div>
              <textarea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Type your response..."
                className="w-full h-28 px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-400"
                disabled={isSubmitting}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowReplyForm(false);
                    setReplyMessage('');
                  }}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReply}
                  disabled={!replyMessage.trim() || isSubmitting}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSubmitting ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}