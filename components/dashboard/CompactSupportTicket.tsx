'use client';

import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
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

interface CompactSupportTicketProps {
  ticket: SupportTicket;
  onOpen: (ticket: SupportTicket) => void;
}

export function CompactSupportTicket({ ticket, onOpen }: CompactSupportTicketProps) {
  const settings = useFormatSettings();
  const ticketIdLabel = `#${ticket.id.slice(0, 12)}`;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700';
      case 'CLOSED':
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700';
    }
  };

  const unreadReplies = ticket.replies.filter(reply => 
    reply.user?.role === 'ADMIN' && 
    new Date(reply.createdAt) > new Date(ticket.createdAt)
  ).length;
  const showUnreadBadge = ticket.status !== 'CLOSED' && unreadReplies > 0;

  return (
    <>
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors">
        {/* Compact Header - Now clickable to open modal */}
        <div 
          className="p-3 sm:p-4 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors"
          onClick={() => onOpen(ticket)}
        >
          <div className="flex items-start sm:items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 sm:mb-2">
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white truncate">{ticket.subject}</h4>
                <span className="px-2 py-0.5 text-[11px] font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-full" title={ticket.id}>
                  {ticketIdLabel}
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getStatusColor(ticket.status)}`}>
                  {ticket.status.replace('_', ' ')}
                </span>
                {showUnreadBadge && (
                  <span className="bg-blue-600 text-white text-[11px] px-2 py-0.5 rounded-full">
                    {unreadReplies} new
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="whitespace-nowrap">{formatDate(ticket.createdAt, { mode: settings.mode, timezone: settings.timezone })}</span>
                <span className="hidden sm:inline">•</span>
                <span className="whitespace-nowrap">{ticket.replies.length} replies</span>
              </div>
            </div>
            
            <div className="flex items-center text-neutral-500 dark:text-neutral-400 ml-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}