"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface BackfillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function BackfillModal({ isOpen, onClose, onRefresh }: BackfillModalProps) {
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  const handleBackfillInvoices = async () => {
    setIsBackfilling(true);
    setBackfillMessage('');

    try {
      const response = await fetch('/api/admin/payments/backfill-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Backfill failed');
      }

      setBackfillMessage(`Success! Updated ${result.updated} payments with payment intent IDs. Processed ${result.processed} total payments.`);

      // Refresh the payments list to show updated data
      onRefresh();

    } catch (error) {
      console.error('Backfill error:', error);
      setBackfillMessage(error instanceof Error ? error.message : 'Failed to backfill payment intent IDs');
    } finally {
      setIsBackfilling(false);
    }
  };
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    if (!isOpen) return;
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl transition-colors dark:border-neutral-700 dark:bg-neutral-900 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Backfill Payment Intent IDs</h3>
            <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              Populate missing Provider payment IDs for historical payments by retrieving them from checkout sessions and subscription invoices.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Close backfill modal"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-5 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
          <div className="font-medium text-neutral-700 dark:text-neutral-200">What this does</div>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Finds payments missing payment intent IDs</li>
            <li>Retrieves payment intents from checkout sessions</li>
            <li>Fetches subscription invoices for recurring payments</li>
            <li>Updates your database with any recovered IDs</li>
          </ul>
        </div>

        {backfillMessage && (
          <div
            className={`mt-6 rounded-lg border p-4 text-sm font-medium ${backfillMessage.startsWith('Success')
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
              }`}
            role={backfillMessage.startsWith('Success') ? 'status' : 'alert'}
          >
            {backfillMessage}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleBackfillInvoices}
            disabled={isBackfilling}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isBackfilling
                ? 'cursor-not-allowed bg-blue-300 dark:bg-blue-800'
                : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {isBackfilling ? 'Processing…' : 'Start Backfill'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}