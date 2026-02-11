"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportTicketForm } from './SupportTicketForm';
import { dashboardMutedPanelClass } from './dashboardSurfaces';

interface SupportRequestLauncherProps {
  userId: string;
  activeTicketsCount: number;
  onTicketSubmitted?: () => void;
}

const MODAL_TRANSITION_MS = 160;

export function SupportRequestLauncher({ userId, activeTicketsCount, onTicketSubmitted }: SupportRequestLauncherProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isModalOpen) {
      setModalVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setModalVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [isModalOpen]);

  const clearCloseTimer = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const closeModal = useCallback(() => {
    setModalVisible(false);
    clearCloseTimer();
    closeTimeoutRef.current = setTimeout(() => {
      setIsModalOpen(false);
      closeTimeoutRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, []);

  const openModal = () => {
    clearCloseTimer();
    setIsModalOpen(true);
  };

  useEffect(() => () => clearCloseTimer(), []);

  const activeTicketMessage = activeTicketsCount > 0
    ? `You currently have ${activeTicketsCount} open ticket${activeTicketsCount === 1 ? '' : 's'}.`
    : 'You currently have no open tickets.';

  const informativeCardClasses = activeTicketsCount > 0
    ? dashboardMutedPanelClass(
        'p-4 text-sm leading-relaxed border-amber-200/80 bg-amber-50/80 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100'
      )
    : dashboardMutedPanelClass('p-4 text-sm leading-relaxed text-slate-600 dark:text-neutral-200');

  const informativeHeadingClass = activeTicketsCount > 0
    ? 'text-sm font-semibold text-amber-900 dark:text-amber-100'
    : 'text-sm font-semibold text-slate-700 dark:text-neutral-100';

  const handleTicketSuccess = () => {
    onTicketSubmitted?.();
    closeModal();
  };

  return (
    <div className="space-y-6 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-sm lg:transition-shadow dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:shadow-[0_0_25px_rgba(15,23,42,0.45)]">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-neutral-50">Submit a support request</h3>
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            Share as much context as you can. Screenshots, links, and recent changes help our team reproduce issues faster.
          </p>
        </div>
        <div className={informativeCardClasses}>
          <div className={informativeHeadingClass}>Avoid duplicate tickets</div>
          <p>
            {activeTicketMessage} If you already have an open request, reply to that conversation instead of creating another one so we can keep everything in one thread.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-500 dark:text-neutral-400">
          Average response time: <span className="text-slate-700 dark:text-neutral-200">within 24 hours</span>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        >
          Open support form
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-150 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-request-modal-title"
            className={`relative z-10 w-full max-w-2xl bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl overflow-hidden transition-transform transition-opacity duration-150 ${modalVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]'}`}
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900">
              <div>
                <h2 id="support-request-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">Submit a Support Request</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  If you already have an open ticket, please update that conversation instead of creating a new one.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Close support request form"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 bg-neutral-50 dark:bg-neutral-950/60">
              <SupportTicketForm userId={userId} onSuccess={handleTicketSuccess} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
