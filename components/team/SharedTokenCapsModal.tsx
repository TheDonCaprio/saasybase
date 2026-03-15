'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TeamDashboardOrganization } from '../../lib/team-dashboard';

type CapStrategy = 'SOFT' | 'HARD' | 'DISABLED';

const CAP_STRATEGY_OPTIONS: Array<{ value: CapStrategy; label: string }> = [
    { value: 'SOFT', label: 'Soft — warn only' },
    { value: 'HARD', label: 'Hard — block usage' },
    { value: 'DISABLED', label: 'Disabled' },
];

interface SharedTokenCapsModalProps {
    isOpen: boolean;
    onClose: () => void;
    organization: TeamDashboardOrganization;
    onUpdateCaps: (caps: {
        memberTokenCap: number | null;
        memberCapStrategy: CapStrategy;
        memberCapResetIntervalHours: number | null;
        ownerExemptFromCaps: boolean;
    }) => Promise<void>;
    busyAction: string | null;
    tokenLabel: string;
    tokenLabelTitle: string;
}

export function SharedTokenCapsModal({
    isOpen,
    onClose,
    organization,
    onUpdateCaps,
    busyAction,
    tokenLabel,
    tokenLabelTitle,
}: SharedTokenCapsModalProps) {
    if (!isOpen || typeof document === 'undefined') return null;

    return (
        <SharedTokenCapsModalPanel
            key={`${organization.id}:${isOpen ? 'open' : 'closed'}`}
            onClose={onClose}
            organization={organization}
            onUpdateCaps={onUpdateCaps}
            busyAction={busyAction}
            tokenLabel={tokenLabel}
            tokenLabelTitle={tokenLabelTitle}
        />
    );
}

function SharedTokenCapsModalPanel({
    onClose,
    organization,
    onUpdateCaps,
    busyAction,
    tokenLabel,
    tokenLabelTitle,
}: Omit<SharedTokenCapsModalProps, 'isOpen'>) {
    const [capInput, setCapInput] = useState(() => (typeof organization.memberTokenCap === 'number' ? String(organization.memberTokenCap) : ''));
    const [capStrategy, setCapStrategy] = useState<CapStrategy>(() => (organization.memberCapStrategy || 'SOFT').toUpperCase() as CapStrategy);
    const [resetInput, setResetInput] = useState(() => (
        typeof organization.memberCapResetIntervalHours === 'number'
            ? String(organization.memberCapResetIntervalHours)
            : ''
    ));
    const [ownerExempt, setOwnerExempt] = useState(() => organization.ownerExemptFromCaps || false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleSave = async () => {
        const normalizedCap = capInput.trim();
        const parsedCap = normalizedCap === '' ? null : Number.parseInt(normalizedCap, 10);
        if (parsedCap != null && (Number.isNaN(parsedCap) || parsedCap < 0)) {
            setError('Member cap must be zero or greater. Leave blank for unlimited.');
            return;
        }

        const normalizedReset = resetInput.trim();
        const parsedReset = normalizedReset === '' ? null : Number.parseInt(normalizedReset, 10);
        if (parsedReset != null && (Number.isNaN(parsedReset) || parsedReset <= 0)) {
            setError('Reset window must be a positive number of hours or left blank.');
            return;
        }

        setError(null);
        await onUpdateCaps({
            memberTokenCap: parsedCap,
            memberCapStrategy: capStrategy,
            memberCapResetIntervalHours: parsedReset,
            ownerExemptFromCaps: ownerExempt,
        });
        onClose();
    };

    const savingCaps = busyAction === 'updateCaps';

    return createPortal(
        <div className="fixed inset-0 z-[70000] flex min-h-screen items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
                <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Shared token caps</h2>
                        <p className="text-sm text-neutral-400">
                            Set the per-member limit for shared {tokenLabel} and choose how strictly to enforce it.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={savingCaps}
                        className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="grid gap-6 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm text-neutral-200">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Default cap ({tokenLabelTitle})</span>
                            <input
                                type="number"
                                min={0}
                                value={capInput}
                                onChange={(event) => setCapInput(event.target.value)}
                                placeholder="Unlimited"
                                className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 shadow-sm transition focus:border-indigo-400 focus:outline-none"
                            />
                            <span className="text-xs text-neutral-400">Leave blank for unlimited per-member balance.</span>
                        </label>

                        <label className="flex flex-col gap-1 text-sm text-neutral-200">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Strategy</span>
                            <select
                                value={capStrategy}
                                onChange={(event) => setCapStrategy(event.target.value as CapStrategy)}
                                className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 shadow-sm transition focus:border-indigo-400 focus:outline-none"
                            >
                                {CAP_STRATEGY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <span className="text-xs text-neutral-400">Soft caps warn members; hard caps block usage.</span>
                        </label>

                        <label className="flex flex-col gap-1 text-sm text-neutral-200">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Reset window (hours)</span>
                            <input
                                type="number"
                                min={1}
                                value={resetInput}
                                onChange={(event) => setResetInput(event.target.value)}
                                placeholder="Plan default"
                                className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 shadow-sm transition focus:border-indigo-400 focus:outline-none"
                            />
                            <span className="text-xs text-neutral-400">Blank follows the billing cycle.</span>
                        </label>

                        <div className="flex flex-col gap-2 pt-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Exemptions</span>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={ownerExempt}
                                        onChange={(e) => setOwnerExempt(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="h-5 w-9 rounded-full bg-neutral-700 transition peer-checked:bg-indigo-600"></div>
                                    <div className="absolute left-1 h-3 w-3 rounded-full bg-white transition peer-checked:translate-x-4"></div>
                                </div>
                                <span className="text-sm text-neutral-200 group-hover:text-white transition-colors">Exclude admin from caps</span>
                            </label>
                            <span className="text-xs text-neutral-400">The workspace owner will have unlimited access to shared pool tokens regardless of caps.</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 p-6 pt-0 justify-end">
                    <button
                        onClick={onClose}
                        disabled={savingCaps}
                        className="px-4 py-2 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={savingCaps}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {savingCaps ? 'Saving…' : 'Save cap settings'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
