'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { showToast } from '../ui/Toast';
import AdjustOrgTokensModal from './AdjustOrgTokensModal';
import type { OrganizationRecord } from './OrganizationsClient';

type OrganizationDetail = {
  id: string;
  name: string;
  slug: string;
  billingEmail: string | null;
  plan: { id: string; name: string } | null;
  owner: { id: string; name: string | null; email: string | null } | null;
  tokenBalance: number;
  memberTokenCap: number | null;
  memberCapStrategy: string | null;
  memberCapResetIntervalHours: number | null;
  tokenPoolStrategy: string | null;
  seatLimit: number | null;
  stats: { activeMembers: number; pendingInvites: number; totalMembers: number };
};

type Props = {
  orgId: string;
  initialName: string;
  initialSlug: string;
  initialTokenBalance: number;
  onClose: () => void;
  onUpdated?: (org: Partial<OrganizationRecord> & { id: string }) => void;
};

type FormState = {
  name: string;
  slug: string;
  billingEmail: string;
  seatLimit: string;
  memberTokenCap: string;
  memberCapStrategy: string;
  memberCapResetIntervalHours: string;
  tokenPoolStrategy: string;
};

const DEFAULT_FORM_STATE: FormState = {
  name: '',
  slug: '',
  billingEmail: '',
  seatLimit: '',
  memberTokenCap: '',
  memberCapStrategy: 'DISABLED',
  memberCapResetIntervalHours: '',
  tokenPoolStrategy: 'SHARED_FOR_ORG'
};

export default function EditOrganizationModal({ orgId, initialName, initialSlug, initialTokenBalance, onClose, onUpdated }: Props) {
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [formState, setFormState] = useState<FormState>({ ...DEFAULT_FORM_STATE, name: initialName, slug: initialSlug });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/organizations/${orgId}`, { cache: 'no-store' });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load organization');
        }
        const json = await response.json();
        if (cancelled) return;
        const org = json?.organization as OrganizationDetail | undefined;
        if (org) {
          setDetail(org);
          setFormState({
            name: org.name ?? '',
            slug: org.slug ?? '',
            billingEmail: org.billingEmail ?? '',
            seatLimit: org.seatLimit != null ? String(org.seatLimit) : '',
            memberTokenCap: org.memberTokenCap != null ? String(org.memberTokenCap) : '',
            memberCapStrategy: org.memberCapStrategy ?? 'DISABLED',
            memberCapResetIntervalHours: org.memberCapResetIntervalHours != null ? String(org.memberCapResetIntervalHours) : '',
            tokenPoolStrategy: org.tokenPoolStrategy ?? 'SHARED_FOR_ORG'
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load organization';
        showToast(message, 'error');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleChange = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const currentBalance = detail?.tokenBalance ?? initialTokenBalance;

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        name: formState.name.trim(),
        slug: formState.slug.trim(),
        billingEmail: formState.billingEmail.trim(),
        seatLimit: formState.seatLimit.trim() === '' ? null : Number(formState.seatLimit),
        memberTokenCap: formState.memberTokenCap.trim() === '' ? null : Number(formState.memberTokenCap),
        memberCapStrategy: formState.memberCapStrategy,
        memberCapResetIntervalHours: formState.memberCapResetIntervalHours.trim() === '' ? null : Number(formState.memberCapResetIntervalHours),
        tokenPoolStrategy: formState.tokenPoolStrategy
      };

      const response = await fetch(`/api/admin/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to update organization');
      }

      const json = await response.json();
      const updated = json?.organization as OrganizationDetail | undefined;
      if (updated) {
        setDetail(updated);
        onUpdated?.({
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          billingEmail: updated.billingEmail,
          memberTokenCap: updated.memberTokenCap,
          memberCapStrategy: updated.memberCapStrategy,
          memberCapResetIntervalHours: updated.memberCapResetIntervalHours,
          tokenPoolStrategy: updated.tokenPoolStrategy,
          seatLimit: updated.seatLimit,
          activeMembers: updated.stats?.activeMembers ?? 0,
          pendingInvites: updated.stats?.pendingInvites ?? 0
        });
        showToast('Organization updated', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update organization';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [formState, onUpdated, orgId, saving]);

  const summaryItems = useMemo(() => ({
    owner: detail?.owner?.name ?? 'Unassigned',
    ownerEmail: detail?.owner?.email ?? 'No email',
    plan: detail?.plan?.name ?? 'No plan',
    stats: `${detail?.stats?.activeMembers ?? 0} active members`
  }), [detail]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-start justify-center overflow-y-auto px-4 py-6 sm:py-10">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-neutral-950/80"
        onClick={onClose}
        aria-label="Close edit organization modal"
      />
      <div className="relative z-[60001] flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-neutral-900/80 dark:bg-neutral-950/95">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-neutral-900">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit organization</h2>
            <p className="text-sm text-slate-500 dark:text-neutral-400">Manage workspace metadata, limits, and token pool policies.</p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white" aria-label="Close edit organization modal">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <section className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-neutral-900 dark:bg-neutral-900/30 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-neutral-500">Owner</p>
              <p className="text-sm text-slate-900 dark:text-white">{summaryItems.owner}</p>
              <p className="text-xs text-slate-500 dark:text-neutral-400">{summaryItems.ownerEmail}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 dark:text-neutral-500">Plan</p>
              <p className="text-sm text-slate-900 dark:text-white">{summaryItems.plan}</p>
              <p className="text-xs text-slate-500 dark:text-neutral-400">{summaryItems.stats}</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase text-slate-500 dark:text-neutral-500">Token balance</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatNumber(currentBalance)}</p>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800"
                onClick={() => setShowAdjustModal(true)}
              >
                Adjust tokens
              </button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Name</span>
              <input
                type="text"
                value={formState.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Slug</span>
              <input
                type="text"
                value={formState.slug}
                onChange={(e) => handleChange('slug', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Billing email</span>
              <input
                type="email"
                value={formState.billingEmail}
                onChange={(e) => handleChange('billingEmail', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Seat limit</span>
              <input
                type="number"
                min={1}
                value={formState.seatLimit}
                onChange={(e) => handleChange('seatLimit', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              />
            </label>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Member cap strategy</span>
              <select
                value={formState.memberCapStrategy}
                onChange={(e) => handleChange('memberCapStrategy', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              >
                <option value="DISABLED">Disabled</option>
                <option value="SOFT">Soft</option>
                <option value="HARD">Hard</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Member token cap</span>
              <input
                type="number"
                min={0}
                value={formState.memberTokenCap}
                onChange={(e) => handleChange('memberTokenCap', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Cap reset interval (hours)</span>
              <input
                type="number"
                min={1}
                value={formState.memberCapResetIntervalHours}
                onChange={(e) => handleChange('memberCapResetIntervalHours', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              />
            </label>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-600 dark:text-neutral-300">Token pool strategy</span>
              <select
                value={formState.tokenPoolStrategy}
                onChange={(e) => handleChange('tokenPoolStrategy', e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                disabled={loading}
              >
                <option value="SHARED_FOR_ORG">Shared for org</option>
                <option value="ALLOCATED_PER_MEMBER">Allocated per member</option>
              </select>
            </label>
          </section>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-neutral-900">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

        {showAdjustModal && (
          <AdjustOrgTokensModal
            orgId={orgId}
            orgName={formState.name}
            currentBalance={currentBalance}
            onClose={() => setShowAdjustModal(false)}
            onSuccess={(newBalance) => {
              setDetail((prev) => (prev ? { ...prev, tokenBalance: newBalance } : prev));
              onUpdated?.({ id: orgId, tokenBalance: newBalance });
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
