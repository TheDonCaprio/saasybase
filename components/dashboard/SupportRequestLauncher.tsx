"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SupportTicketForm } from './SupportTicketForm';
import { dashboardMutedPanelClass, dashboardPanelClass } from './dashboardSurfaces';

interface SupportRequestLauncherProps {
  userId: string;
  activeTicketsCount: number;
  onTicketSubmitted?: () => void;
}

const MODAL_TRANSITION_MS = 180;

export function SupportRequestLauncher({ userId, activeTicketsCount, onTicketSubmitted }: SupportRequestLauncherProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showCloseDraftConfirm, setShowCloseDraftConfirm] = useState(false);

  const [draftSubject, setDraftSubject] = useState('');
  const [draftMessage, setDraftMessage] = useState('');

  const hasDraft = useMemo(() => {
    return Boolean(draftSubject.trim().length > 0 || draftMessage.trim().length > 0);
  }, [draftSubject, draftMessage]);

  const closeModalImmediate = useCallback(() => {
    setShowCloseDraftConfirm(false);
    setModalVisible(false);
    window.setTimeout(() => {
      setIsModalOpen(false);
    }, MODAL_TRANSITION_MS);
  }, []);

  const requestCloseModal = useCallback(() => {
    if (hasDraft) {
      setShowCloseDraftConfirm(true);
      return;
    }
    closeModalImmediate();
  }, [closeModalImmediate, hasDraft]);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
    setModalVisible(false);
    requestAnimationFrame(() => setModalVisible(true));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isModalOpen) requestCloseModal();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isModalOpen, requestCloseModal]);

  const activeTicketMessage = activeTicketsCount > 0
    ? `You currently have ${activeTicketsCount} open ticket${activeTicketsCount === 1 ? '' : 's'}.`
    : 'You currently have no open tickets.';

  const informativeCardClasses = activeTicketsCount > 0
    ? dashboardMutedPanelClass(
        'p-2 sm:p-3 text-xs leading-tight border-amber-200/80 bg-amber-50/80 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100'
      )
    : dashboardMutedPanelClass('p-2 sm:p-3 text-xs leading-tight text-slate-600 dark:text-neutral-200');

  const informativeHeadingClass = activeTicketsCount > 0
    ? 'text-xs font-semibold text-amber-900 dark:text-amber-100'
    : 'text-xs font-semibold text-slate-700 dark:text-neutral-100';

  const handleTicketSuccess = () => {
    onTicketSubmitted?.();
    // Successful submit clears draft; close without prompting.
    setDraftSubject('');
    setDraftMessage('');
    closeModalImmediate();
  };

  return (
    <div className={dashboardPanelClass('space-y-4 p-3 sm:p-4')}>
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Submit a support request</h3>

        </div>
        <div className={informativeCardClasses}>
          <div className={informativeHeadingClass}>Avoid duplicate tickets</div>
          <p className="text-[13px] leading-tight">
            {activeTicketMessage} Reply to an existing request if one exists rather than creating a new ticket.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] text-slate-500 dark:text-neutral-400">
          Avg response: <span className="text-slate-700 dark:text-neutral-200">within 24h</span>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        >
          Open support form
        </button>
      </div>

      {isModalOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-150 ${isModalOpen ? 'pointer-events-auto' : 'pointer-events-none'} ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden={!isModalOpen}
          >
            <div
              className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-150 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
              onClick={requestCloseModal}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="support-request-modal-title"
              className={`relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl transition-all duration-150 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white ${modalVisible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-[0.98] opacity-0'}`}
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
                  onClick={requestCloseModal}
                  className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="Close support request form"
                >
                  ✕
                </button>
              </div>

              <div className="px-6 py-5 bg-neutral-50 dark:bg-neutral-950/60">
                <SupportTicketForm
                  userId={userId}
                  subject={draftSubject}
                  message={draftMessage}
                  onSubjectChange={setDraftSubject}
                  onMessageChange={setDraftMessage}
                  onSuccess={handleTicketSuccess}
                />
              </div>
            </div>

            {showCloseDraftConfirm && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCloseDraftConfirm(false)} />
                <div className="relative w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
                  <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Close support form?</div>
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                    You have an unsent draft. Do you want to keep it for later or discard it?
                  </p>
                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      onClick={() => setShowCloseDraftConfirm(false)}
                    >
                      Continue editing
                    </button>
                    <button
                      type="button"
                      className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900"
                      onClick={() => {
                        setShowCloseDraftConfirm(false);
                        closeModalImmediate();
                      }}
                    >
                      Keep draft & close
                    </button>
                    <button
                      type="button"
                      className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                      onClick={() => {
                        setDraftSubject('');
                        setDraftMessage('');
                        setShowCloseDraftConfirm(false);
                        closeModalImmediate();
                      }}
                    >
                      Discard draft
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )
        : null}
    </div>
  );
}
