'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TeamInviteForm } from './TeamInviteForm';

type InviteNotice = {
    tone: 'success' | 'error';
    message: string;
};

interface InviteTeammatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInvite: (email: string, role: string) => Promise<boolean> | boolean;
    isSubmitting: boolean;
    seatsRemaining: number | null;
    notice?: InviteNotice | null;
}

export function InviteTeammatesModal({
    isOpen,
    onClose,
    onInvite,
    isSubmitting,
    seatsRemaining,
    notice,
}: InviteTeammatesModalProps) {
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape' && isOpen) onClose();
        }
        if (!isOpen) return;
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[70000] flex min-h-screen items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
                <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Invite teammates</h2>
                        <p className="text-sm text-neutral-400">
                            Send invites via email. Members join with their existing account.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    {notice ? (
                        <div
                            className={notice.tone === 'success'
                                ? 'mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200'
                                : 'mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200'}
                        >
                            {notice.message}
                        </div>
                    ) : null}
                    <TeamInviteForm onInvite={onInvite} isSubmitting={isSubmitting} seatsRemaining={seatsRemaining} />
                </div>
            </div>
        </div>,
        document.body
    );
}
