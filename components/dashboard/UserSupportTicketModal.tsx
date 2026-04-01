"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { showToast } from '../ui/Toast';
import { SupportTeamIcon } from '../ui/SupportTeamIcon';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import Confirm from '../ui/Confirm';
import { getSupportTicketCategoryLabel } from '../../lib/support-ticket-categories';

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  createdAt: string | Date;
  createdByRole?: string;
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

interface UserSupportTicketModalProps {
  ticket: SupportTicket | null;
  ticketId?: string | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function UserSupportTicketModal({ ticket, ticketId = null, open, onClose, onUpdate }: UserSupportTicketModalProps) {
  const settings = useFormatSettings();
  // keep a local copy of the ticket so we can poll/update it while the modal is open
  const [localTicket, setLocalTicket] = useState<SupportTicket | null>(ticket);
  // local mount/visibility state to allow a small fade/scale-in animation
  const [visible, setVisible] = useState(false);
  // mounted state to allow exit animation to complete before unmounting
  const [isMounted, setIsMounted] = useState(open);

  // When `open` toggles, animate in on the next frame to avoid an initial
  // render flash where backdrop or modal appears before styles apply.
  useEffect(() => {
    let raf = 0;
    let timeoutId: number | undefined;

    if (open) {
      // mount immediately so enter animation can run
      setIsMounted(true);
      // ensure we start from hidden, then show on next frame
      setVisible(false);
      raf = requestAnimationFrame(() => setVisible(true));
    } else {
      // trigger exit animation and unmount after animation duration
      setVisible(false);
      timeoutId = window.setTimeout(() => {
        setIsMounted(false);
        setLocalTicket(null);
      }, 180);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [open]);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showDraftCloseConfirm, setShowDraftCloseConfirm] = useState(false);
  const [draftCloseIntent, setDraftCloseIntent] = useState<'modal' | 'composer'>('modal');
  const loadedDraftKeyRef = useRef<string | null>(null);

  // sync prop -> local when ticket changes; preserve local copy on close so exit animation can render
  useEffect(() => {
    if (ticket) setLocalTicket(ticket);
  }, [ticket]);

  const draftKey = useMemo(() => {
    const id = localTicket?.id || ticketId;
    return id ? `support:draft:user:reply:${id}` : null;
  }, [localTicket?.id, ticketId]);

  // Load any existing draft when opening the modal (or ticket changes)
  useEffect(() => {
    if (!open) return;
    if (!draftKey) return;
    if (typeof window === 'undefined') return;
    try {
      const stored = window.sessionStorage.getItem(draftKey) || '';
      loadedDraftKeyRef.current = draftKey;
      if (stored && stored !== replyMessage) {
        setReplyMessage(stored);
        setShowReplyForm(true);
      }
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftKey]);

  // Persist draft as the user types (debounced)
  useEffect(() => {
    if (!draftKey) return;
    if (typeof window === 'undefined') return;
    // Only write after we've loaded/established the key for this open session
    if (loadedDraftKeyRef.current !== draftKey) return;

    const timer = window.setTimeout(() => {
      try {
        const text = replyMessage;
        if (text.trim().length > 0) {
          window.sessionStorage.setItem(draftKey, text);
        } else {
          window.sessionStorage.removeItem(draftKey);
        }
      } catch {
        // ignore storage errors
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [replyMessage, draftKey]);

  const hasReplyDraft = useMemo(() => replyMessage.trim().length > 0, [replyMessage]);

  const discardReplyDraft = useCallback(() => {
    setReplyMessage('');
    setShowReplyForm(false);
    if (!draftKey || typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [draftKey]);

  const requestCloseModal = useCallback(() => {
    if (hasReplyDraft) {
      setDraftCloseIntent('modal');
      setShowDraftCloseConfirm(true);
      return;
    }
    onClose();
  }, [hasReplyDraft, onClose]);

  const requestCancelReply = useCallback(() => {
    if (hasReplyDraft) {
      setDraftCloseIntent('composer');
      setShowDraftCloseConfirm(true);
      return;
    }
    discardReplyDraft();
  }, [discardReplyDraft, hasReplyDraft]);

  const handleReply = async () => {
    if (!replyMessage.trim() || isSubmitting) return;
    if (!localTicket?.id) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/support/tickets/${localTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyMessage.trim() })
      });

      if (response.ok) {
        discardReplyDraft();
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

  const handleCloseTicket = async () => {
    if (!localTicket?.id) return;
    setIsClosing(true);
    try {
      const response = await fetch(`/api/support/tickets/${localTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' })
      });

      if (response.ok) {
        onUpdate();
        showToast('Ticket marked as resolved', 'success');
        setShowCloseConfirm(false);
      } else {
        const error = await response.json();
        showToast(`Failed to close ticket: ${error.error}`, 'error');
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      showToast('Error closing ticket', 'error');
    } finally {
      setIsClosing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-600 text-white';
      case 'IN_PROGRESS':
        return 'bg-yellow-600 text-white';
      case 'CLOSED':
        return 'bg-neutral-600 text-actual-white';
      default:
        return 'bg-neutral-600 text-actual-white';
    }
  };

  

  // Poll ticket detail while modal is open so replies and status refresh automatically
  useEffect(() => {
    const ticketId = localTicket?.id;
    if (!open || !ticketId) return;
    const POLL_INTERVAL = 10000; // 10s when viewing a ticket

    const fetchTicket = async () => {
      try {
        const res = await fetch(`/api/support/tickets/${ticketId}`);
        if (res.ok) {
          const data = await res.json();
          setLocalTicket((prev) => {
            if (!prev) {
              try { window.dispatchEvent(new CustomEvent('support:ticket-updated', { detail: { ticketId: data.id } })); } catch (e) { void e; }
              return data;
            }

            // Lightweight comparison: check reply count and last-reply identity/timestamp
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

  // Guard after hooks so hook order is stable. Use `isMounted` so the
  // component remains mounted during the exit animation even if `open`
  // has been toggled false by the parent.
  if (!isMounted) return null;

  const ticketData = localTicket;
  const fallbackTicketId = ticketData?.id ?? ticketId ?? '';
  const ticketIdLabel = fallbackTicketId ? `#${fallbackTicketId.slice(0, 12)}` : '';

  const isClosed = ticketData?.status === 'CLOSED';
  const canReply = Boolean(ticketData) && !isClosed;
  const unreadReplies = ticketData
    ? ticketData.replies.filter(reply => 
        reply.user?.role === 'ADMIN' && 
        new Date(reply.createdAt) > new Date(ticketData.createdAt)
      ).length
    : 0;
  const showUnreadReplies = Boolean(ticketData) && !isClosed && unreadReplies > 0;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={requestCloseModal}
      />

      {/* Modal */}
      <div className={`bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl z-10 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transition-all duration-150 ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.99]'}`}>
        {ticketData ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded-full" title={ticketData.id}>
                        {ticketIdLabel}
                      </span>
                      <h2 className="text-lg font-medium text-neutral-900 dark:text-white truncate">{ticketData.subject}</h2>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticketData.status)}`}>
                      {ticketData.status.replace('_', ' ')}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200">
                      {getSupportTicketCategoryLabel(ticketData.category)}
                    </span>
                    {showUnreadReplies && (
                      <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                        {unreadReplies} new replies
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{formatDate(ticketData.createdAt, { mode: settings.mode, timezone: settings.timezone })}</span>
                    <span>•</span>
                    <span>{ticketData.replies.length} replies</span>
                  </div>
                </div>
                <button
                  onClick={requestCloseModal}
                  className="ml-4 p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Original Message */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ticketData.createdByRole === 'ADMIN' ? 'bg-gradient-to-br from-purple-500 to-pink-600 text-white' : 'bg-gradient-to-br from-blue-500 to-purple-600 text-actual-white'}`}>
                    {ticketData.createdByRole === 'ADMIN' ? (
                      <SupportTeamIcon className="w-4 h-4" />
                    ) : (
                      <span className="text-actual-white font-medium text-xs">You</span>
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${ticketData.createdByRole === 'ADMIN' ? 'text-purple-700 dark:text-purple-300' : 'text-neutral-900 dark:text-white'}`}>
                      {ticketData.createdByRole === 'ADMIN' ? 'Support Team' : 'You'}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(ticketData.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                    </div>
                  </div>
                </div>
                <div className="prose prose-neutral max-w-none dark:prose-invert">
                  <div className="whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed">
                    {ticketData.message}
                  </div>
                </div>
              </div>

              {/* Replies */}
              {ticketData.replies.map((reply, index) => {
                void index;
                const userRole = reply.user?.role ?? 'USER';
                const isSupport = userRole !== 'USER';
                const replyAuthor = isSupport ? 'Support Team' : 'You';
                
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
                          <span className="font-medium text-xs">You</span>
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

            {/* Action Buttons and Reply Form */}
            {canReply && (
              <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                {!showReplyForm && (
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={() => setShowCloseConfirm(true)}
                      disabled={isClosing}
                      className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 underline transition-colors disabled:opacity-50"
                    >
                      {isClosing ? 'Closing...' : 'Mark Issue as Resolved'}
                    </button>
                    <button
                      onClick={() => setShowReplyForm(true)}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                      Add Reply
                    </button>
                  </div>
                )}

                {showReplyForm && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-actual-white text-xs">You</span>
                      </div>
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Replying to ticket</span>
                    </div>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your reply..."
                      className="w-full h-28 px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-400"
                      disabled={isSubmitting}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          requestCancelReply();
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
                )}
              </div>
            )}

            {!canReply && (
              <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 text-center">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  This ticket is closed. Contact support if you need to reopen it.
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-sm text-neutral-500 dark:text-neutral-300">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            <p>Loading ticket details…</p>
            <button
              onClick={requestCloseModal}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {showDraftCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDraftCloseConfirm(false)} />
          <div className="relative w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
            <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Close without sending?</div>
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
              You have an unsent reply. Do you want to keep it as a draft or discard it?
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-nowrap sm:justify-end">
              <button
                type="button"
                className="whitespace-nowrap rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onClick={() => setShowDraftCloseConfirm(false)}
              >
                Continue editing
              </button>
              <button
                type="button"
                className="whitespace-nowrap rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900"
                onClick={() => {
                  setShowDraftCloseConfirm(false);
                  if (draftCloseIntent === 'composer') {
                    setShowReplyForm(false);
                    return;
                  }
                  onClose();
                }}
              >
                Keep draft & close
              </button>
              <button
                type="button"
                className="whitespace-nowrap rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                onClick={() => {
                  discardReplyDraft();
                  setShowDraftCloseConfirm(false);
                  if (draftCloseIntent === 'composer') {
                    return;
                  }
                  onClose();
                }}
              >
                Discard draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <Confirm
        title="Mark Issue as Resolved"
        description={
          <div className="space-y-2">
            <p>Are you sure you want to mark this issue as resolved?</p>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 font-medium dark:border-amber-300/30 dark:bg-amber-500/20 dark:text-amber-100">
              <span className="font-semibold">⚠️ Warning:</span> This will close the ticket and you won&apos;t be able to add more replies. You can contact support if you need to reopen it later.
            </div>
          </div>
        }
        confirmText="Yes, Mark as Resolved"
        cancelText="Cancel"
        open={showCloseConfirm}
        onConfirm={handleCloseTicket}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}