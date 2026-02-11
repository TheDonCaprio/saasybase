"use client";

import { useState } from 'react';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import SupportTicketModal from './SupportTicketModal';
import { dashboardPanelClass } from '../dashboard/dashboardSurfaces';

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

interface AdminCompactSupportTicketProps {
  ticket: SupportTicket;
  onUpdate: () => void;
}

export function AdminCompactSupportTicket({ ticket, onUpdate }: AdminCompactSupportTicketProps) {
  const settings = useFormatSettings();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const ticketIdLabel = `#${ticket.id.slice(0, 12)}`;

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-200 dark:bg-rose-500/20';
      case 'IN_PROGRESS':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-200 dark:bg-amber-500/20';
      case 'CLOSED':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 dark:bg-emerald-500/20';
      default:
        return 'bg-slate-100 text-slate-600 dark:text-neutral-300 dark:bg-neutral-800/70';
    }
  };

  const isClosed = ticket.status === 'CLOSED';
  const isNewTicket = ticket.replies.length === 0 && !isClosed;
  const lastReply = ticket.replies[ticket.replies.length - 1];
  const needsResponse = !isClosed && (!lastReply || lastReply.user?.role !== 'ADMIN');
  const senderName = ticket.user?.name || ticket.user?.email || 'Unknown User';
  
  // Find last admin reply to show who responded
  const lastAdminReply = [...ticket.replies].reverse().find((r) => r.user?.role === 'ADMIN');
  const lastAdminName = lastAdminReply?.user?.name || lastAdminReply?.user?.email || null;

  return (
    <>
      <div className={dashboardPanelClass('p-0 overflow-hidden transition hover:shadow-lg')}>
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setIsModalOpen(true)}
        >
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-200" title={ticket.id}>
                {ticketIdLabel}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(ticket.status)}`}>
                {ticket.status.replace('_', ' ')}
              </span>
              {needsResponse && (
                <span className="rounded-full bg-rose-500 text-[11px] font-semibold uppercase tracking-wide text-white px-2.5 py-1">
                  Needs response
                </span>
              )}
              {isNewTicket && (
                <span className="rounded-full bg-blue-500 text-[11px] font-semibold uppercase tracking-wide text-white px-2.5 py-1">
                  New
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-50 line-clamp-2">
                {ticket.subject}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-neutral-400">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-[11px] font-semibold text-white">
                    {senderName.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-indigo-600 dark:text-indigo-300">{senderName}</span>
                </div>
                <span>{formatDate(ticket.createdAt, { mode: settings.mode, timezone: settings.timezone })}</span>
                <span>{ticket.replies.length} repl{ticket.replies.length === 1 ? 'y' : 'ies'}</span>
                {lastAdminName && (
                  <span className="text-slate-400 dark:text-neutral-500">· Last: {lastAdminName}</span>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Modal */}
      <SupportTicketModal 
        ticket={ticket}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUpdate={() => {
          onUpdate();
          // Keep modal open after updates so user can continue working
        }}
      />
    </>
  );
}