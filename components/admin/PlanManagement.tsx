"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/Toast';
import ListFilters from '../ui/ListFilters';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { useListFilterState } from '../hooks/useListFilters';
import IconActionButton from '../ui/IconActionButton';
import { faPen, faTrash, faPlay, faPause, faCopy } from '@fortawesome/free-solid-svg-icons';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';
import { parseProviderIdMap } from '../../lib/utils/provider-ids';

type PlanStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'AUTO_RENEW' | 'ONE_TIME';

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

const formatDuration = (hours: number) => {
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${formatNumber(days)} day${days === 1 ? '' : 's'}`;
  }
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return `${formatNumber(days)}d ${formatNumber(remaining)}h`;
  }
  return `${formatNumber(hours)} hour${hours === 1 ? '' : 's'}`;
};

const sortPlans = (items: Plan[]) =>
  [...items].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });

type Plan = {
  id: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  priceCents: number;
  durationHours: number;
  active: boolean;
  sortOrder: number;
  externalPriceId?: string | null;
  externalPriceIds?: string | null;
  externalProductIds?: string | null;
  autoRenew?: boolean | null;
  recurringInterval?: string | null;
  recurringIntervalCount?: number | null;
  tokenLimit?: number | null;
  tokenName?: string | null;
  supportsOrganizations?: boolean | null;
  organizationSeatLimit?: number | null;
  organizationTokenPoolStrategy?: string | null;
  activeSubscriberCount: number;
};

export function PlanManagement({ plans: initialPlans, currency }: { plans: Plan[]; currency: string }) {
  // Format cents as currency using the passed currency
  const formatCurrency = useCallback((cents: number) => formatCurrencyUtil(cents, currency), [currency]);
  const currencyLabel = (currency || 'USD').toUpperCase();

  const [plans, setPlans] = useState<Plan[]>(() => sortPlans(initialPlans || []));
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'priceCents' | 'tokenLimit'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  type Form = { name: string; shortDescription: string; description: string; priceCents: number; durationHours: number; active: boolean; sortOrder: number; externalPriceId?: string; autoRenew: boolean; recurringInterval: 'day' | 'week' | 'month' | 'year'; recurringIntervalCount: number; tokenLimit: string; tokenName: string; supportsOrganizations: boolean; organizationSeatLimit: string; organizationTokenPoolStrategy: 'SHARED_FOR_ORG' };
  const [form, setForm] = useState<Form>({
    name: '',
    shortDescription: '',
    description: '',
    priceCents: 0,
    durationHours: 24,
    active: true,
    sortOrder: 0,
    externalPriceId: '',
    autoRenew: false,
    recurringInterval: 'month',
    recurringIntervalCount: 1,
    tokenLimit: '',
    tokenName: '',
    supportsOrganizations: false,
    organizationSeatLimit: '',
    organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
  });
  const [originalPlan, setOriginalPlan] = useState<Plan | null>(null);
  const [priceDisplay, setPriceDisplay] = useState<string>((form.priceCents / 100).toFixed(2));
  const [advancedBillingOverrideOpen, setAdvancedBillingOverrideOpen] = useState(false);
  // Parse a user-entered currency string (e.g. "$19.99" or "19.99") into integer cents
  const parseCurrencyToCents = (s: string): number | null => {
    const cleaned = String(s).replace(/[^0-9.]/g, '');
    if (cleaned === '') return null;
    const n = parseFloat(cleaned);
    if (Number.isNaN(n)) return null;
    return Math.round(n * 100);
  };

  // Prevent typing anything except digits and a single dot.
  const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation and control keys
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
    if (allowedKeys.includes(e.key)) return;

    // Allow common modifiers (copy/paste/select all/cut)
    if (e.ctrlKey || e.metaKey) return;

    // Allow a single dot
    if (e.key === '.') {
      if ((e.currentTarget as HTMLInputElement).value.includes('.')) {
        e.preventDefault();
      }
      return;
    }

    // Allow digits
    if (/^[0-9]$/.test(e.key)) return;

    // Block everything else
    e.preventDefault();
  };

  const handlePricePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text') || '';
    // Keep only digits and dot
    let cleaned = String(text).replace(/[^0-9.]/g, '');
    // Keep only the first dot if multiple
    const firstDotIndex = cleaned.indexOf('.');
    if (firstDotIndex !== -1) {
      cleaned = cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
    }
    if (cleaned === '') return;
    // Update both display and form (if parseable)
    setPriceDisplay(cleaned);
    const cents = parseCurrencyToCents(cleaned);
    if (cents !== null) setForm(prev => ({ ...prev, priceCents: cents }));
  };
  const { search, setSearch, debouncedSearch, status, setStatus } = useListFilterState('', 'ALL');
  const statusFilter = (status.toUpperCase() as PlanStatusFilter) || 'ALL';

  useEffect(() => {
    setPlans(sortPlans(initialPlans || []));
  }, [initialPlans]);

  const isEditingExistingPlan = Boolean(editingPlanId);

  const externalPriceLabelForPlan = useCallback((plan: Plan): string | null => {
    const map = parseProviderIdMap(plan.externalPriceIds ?? null);
    const entries = Object.entries(map).filter(([, value]) => typeof value === 'string' && value.length > 0);
    if (entries.length > 0) {
      return entries.map(([provider, value]) => `${provider}: ${value}`).join(' · ');
    }
    if (plan.externalPriceId) return plan.externalPriceId;
    return null;
  }, []);

  const getExternalPricesForPlan = useCallback((plan: Plan): Array<{ provider: string; priceId: string }> => {
    const map = parseProviderIdMap(plan.externalPriceIds ?? null);
    const entries = Object.entries(map).filter(([, value]) => typeof value === 'string' && value.length > 0);
    if (entries.length > 0) {
      return entries.map(([provider, value]) => ({ provider, priceId: value }));
    }
    if (plan.externalPriceId) return [{ provider: 'unknown', priceId: plan.externalPriceId }];
    return [];
  }, []);

  const trimmedSearch = debouncedSearch.trim().toLowerCase();

  const filteredPlans = useMemo(() => {
    let result = plans.filter((plan) => {
      const externalLabel = externalPriceLabelForPlan(plan) ?? '';
      const matchesSearch = trimmedSearch
        ? [plan.name, plan.shortDescription ?? '', plan.description ?? '', plan.externalPriceId ?? '', plan.externalPriceIds ?? '', externalLabel]
          .some((field) => field.toLowerCase().includes(trimmedSearch))
        : true;

      if (!matchesSearch) return false;

      switch (statusFilter) {
        case 'ACTIVE':
          return plan.active;
        case 'INACTIVE':
          return !plan.active;
        case 'AUTO_RENEW':
          return Boolean(plan.autoRenew);
        case 'ONE_TIME':
          return !plan.autoRenew;
        default:
          return true;
      }
    });

    // Apply sorting
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'createdAt') {
        // Since we don't have createdAt on client, fallback to sortOrder
        cmp = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      } else if (sortBy === 'priceCents') {
        cmp = a.priceCents - b.priceCents;
      } else if (sortBy === 'tokenLimit') {
        // Treat unlimited (null) as largest by sorting to the end
        const aLimit = a.tokenLimit ?? Infinity;
        const bLimit = b.tokenLimit ?? Infinity;
        cmp = aLimit - bLimit;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [plans, statusFilter, trimmedSearch, sortBy, sortOrder, externalPriceLabelForPlan]);

  const activeCount = useMemo(() => plans.filter((p) => p.active).length, [plans]);
  const autoRenewCount = useMemo(() => plans.filter((p) => p.autoRenew).length, [plans]);
  const limitedCount = useMemo(() => plans.filter((p) => p.tokenLimit != null).length, [plans]);
  const hasActiveFilters = Boolean(trimmedSearch) || statusFilter !== 'ALL';

  const handleStatusChange = (value: string) => {
    setStatus(value.toUpperCase());
  };

  const refreshPlans = useCallback(async (showSuccessToast = true) => {
    try {
      const res = await fetch('/api/admin/plans');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        showToast(json?.error || 'Failed to refresh plans', 'error');
        return;
      }
      const json = (await res.json()) as Array<Plan & { activeSubscriberCount?: number }>;
      setPlans(sortPlans(json.map((plan) => ({ ...plan, activeSubscriberCount: plan.activeSubscriberCount ?? 0 }))));
      if (showSuccessToast) {
        showToast('Plans refreshed', 'success');
      }
    } catch (error) {
      void error;
      showToast('Failed to refresh plans', 'error');
    } finally {
    }
  }, []);

  const [syncingProviders, setSyncingProviders] = useState(false);
  const syncProviders = useCallback(async () => {
    setSyncingProviders(true);
    try {
      const res = await fetch('/api/admin/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all' }),
      });

      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage =
          json && typeof json === 'object' && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
            ? (json as { error: string }).error
            : 'Failed to sync billing catalog';
        showToast(errorMessage, 'error');
        return;
      }

      showToast('Synced plans & coupons across providers', 'success');
      await refreshPlans();
    } catch (err) {
      void err;
      showToast('Failed to sync billing catalog', 'error');
    } finally {
      setSyncingProviders(false);
    }
  }, [refreshPlans]);

  async function togglePlanStatus(id: string, active: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/plans/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) });
      if (res.ok) {
        setPlans((prev) => sortPlans(prev.map((x) => (x.id === id ? { ...x, active } : x))));
        showToast(`Plan ${active ? 'activated' : 'deactivated'}`, 'success');
      } else {
        const json = await res.json().catch(() => ({}));
        showToast(json?.error || 'Unable to update', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  async function deletePlan(id: string) {
    // Open the confirm modal instead of native confirm()
    setPendingDeleteId(id);
    setForceDelete(false);
    setDeleteModalOpen(true);
  }

  // Modal-related state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [forceDelete, setForceDelete] = useState(false);

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setLoading(true);
    try {
      const url = `/api/admin/plans/${pendingDeleteId}` + (forceDelete ? '?force=1' : '');
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setPlans((p) => p.filter((x) => x.id !== pendingDeleteId));
        setDeleteModalOpen(false);
        setPendingDeleteId(null);
        showToast('Plan deleted', 'success');
        await refreshPlans(false);
      } else {
        showToast(json?.error || 'Unable to delete', 'error');
      }
    } finally { setLoading(false); }
  }

  function openDuplicate(id: string) {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    setEditingPlanId(null);
    setOriginalPlan(null);
    setForm({
      name: `${plan.name} (Copy)`,
      shortDescription: plan.shortDescription || '',
      description: plan.description || '',
      priceCents: plan.priceCents,
      durationHours: plan.durationHours,
      active: plan.active,
      sortOrder: (plan.sortOrder ?? plans.length) + 1,
      externalPriceId: '',
      autoRenew: plan.autoRenew || false,
      recurringInterval: (plan.recurringInterval as 'day' | 'week' | 'month' | 'year') || 'month',
      recurringIntervalCount: typeof plan.recurringIntervalCount === 'number' && Number.isFinite(plan.recurringIntervalCount) ? plan.recurringIntervalCount : 1,
      tokenLimit: plan.tokenLimit == null ? '' : String(plan.tokenLimit),
      tokenName: plan.tokenName || '',
      supportsOrganizations: plan.supportsOrganizations === true,
      organizationSeatLimit: plan.organizationSeatLimit == null ? '' : String(plan.organizationSeatLimit),
      organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
    });
    setAdvancedBillingOverrideOpen(false);
    setPriceDisplay((plan.priceCents / 100).toFixed(2));
    setShowModal(true);
  }

  function openCreate() {
    setEditingPlanId(null);
    setOriginalPlan(null);
    setForm({
      name: '',
      shortDescription: '',
      description: '',
      priceCents: 0,
      durationHours: 24,
      active: true,
      sortOrder: plans.length,
      externalPriceId: '',
      autoRenew: false,
      recurringInterval: 'month',
      recurringIntervalCount: 1,
      tokenLimit: '',
      tokenName: '',
      supportsOrganizations: false,
      organizationSeatLimit: '',
      organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
    });
    setAdvancedBillingOverrideOpen(false);
    setPriceDisplay((0 / 100).toFixed(2));
    setShowModal(true);
  }

  function openEdit(id: string) {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    setEditingPlanId(id);
    setOriginalPlan(plan);
    setForm({
      name: plan.name,
      shortDescription: plan.shortDescription || '',
      description: plan.description || '',
      priceCents: plan.priceCents,
      durationHours: plan.durationHours,
      active: plan.active,
      sortOrder: plan.sortOrder,
      externalPriceId: plan.externalPriceId || '',
      autoRenew: plan.autoRenew || false,
      recurringInterval: (plan.recurringInterval as 'day' | 'week' | 'month' | 'year') || 'month',
      recurringIntervalCount: typeof plan.recurringIntervalCount === 'number' && Number.isFinite(plan.recurringIntervalCount) ? plan.recurringIntervalCount : 1,
      tokenLimit: plan.tokenLimit == null ? '' : String(plan.tokenLimit),
      tokenName: plan.tokenName || '',
      supportsOrganizations: plan.supportsOrganizations === true,
      organizationSeatLimit: plan.organizationSeatLimit == null ? '' : String(plan.organizationSeatLimit),
      organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
    });
    setAdvancedBillingOverrideOpen(false);
    setPriceDisplay((plan.priceCents / 100).toFixed(2));
    setShowModal(true);
  }

  async function save() {
    setLoading(true);
    try {
      // Convert string tokenLimit to number or null
      const payload = {
        ...form,
        tokenLimit: form.tokenLimit === '' ? null : Number(form.tokenLimit),
        tokenName: form.tokenName === '' ? null : form.tokenName,
        supportsOrganizations: form.supportsOrganizations,
        organizationSeatLimit:
          !form.supportsOrganizations || form.organizationSeatLimit === ''
            ? null
            : Number(form.organizationSeatLimit),
        organizationTokenPoolStrategy: form.supportsOrganizations ? 'SHARED_FOR_ORG' : null,
      };
      if (editingPlanId) {
        const res = await fetch(`/api/admin/plans/${editingPlanId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setPlans((p) =>
            sortPlans(
              p.map((x) => (x.id === editingPlanId ? { ...x, ...json.plan, activeSubscriberCount: x.activeSubscriberCount } : x))
            )
          );
          showToast('Plan updated', 'success');
          await refreshPlans(false);
          const warnings = Array.isArray((json as { warnings?: unknown }).warnings)
            ? ((json as { warnings?: unknown[] }).warnings ?? []).filter((w): w is string => typeof w === 'string' && w.length > 0)
            : [];
          if (warnings.length > 0) {
            showToast(`Plan updated with warnings: ${warnings[0]}`, 'error');
          }
        } else showToast(json?.error || 'Unable to update', 'error');
      } else {
        const res = await fetch('/api/admin/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setPlans((p) => sortPlans([...p, { ...json.plan, activeSubscriberCount: 0 }]));
          showToast('Plan created', 'success');
          await refreshPlans(false);
          const warnings = Array.isArray((json as { warnings?: unknown }).warnings)
            ? ((json as { warnings?: unknown[] }).warnings ?? []).filter((w): w is string => typeof w === 'string' && w.length > 0)
            : [];
          if (warnings.length > 0) {
            showToast(`Plan created with warnings: ${warnings[0]}`, 'error');
          }
        } else showToast(json?.error || 'Unable to create', 'error');
      }
      setShowModal(false);
    } finally {
      setLoading(false);
    }
  }

  const statusOptions: PlanStatusFilter[] = ['ALL', 'ACTIVE', 'INACTIVE', 'AUTO_RENEW', 'ONE_TIME'];
  const statusLabelMap: Record<PlanStatusFilter, string> = {
    ALL: 'All plans',
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    AUTO_RENEW: 'Auto renew',
    ONE_TIME: 'One-time'
  };
  const statusFilterLabel = statusLabelMap[statusFilter];
  const totalPlans = plans.length;

  const getStatusBadgeClass = (isActive: boolean) =>
    isActive
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200';

  const getPlanTypeBadgeClass = (isSubscription?: boolean | null) =>
    isSubscription
      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-100'
      : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300';

  return (
    <div className="space-y-6">


      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          currentStatus={statusFilter}
          onStatusChange={handleStatusChange}
          sortOptions={[
            { value: 'createdAt', label: 'Created' },
            { value: 'priceCents', label: 'Price' },
            { value: 'tokenLimit', label: 'Token limit' }
          ]}
          sortBy={sortBy}
          onSortByChange={(by) => setSortBy(by as typeof sortBy)}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onRefresh={refreshPlans}
          placeholder="Search plans by name, description, or external price..."
          trailingContent={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={syncProviders}
                disabled={syncingProviders}
                className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 dark:focus-visible:outline-slate-700"
              >
                {syncingProviders ? 'Syncing…' : 'Sync providers'}
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white text-actual-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                New plan
              </button>
            </div>
          }
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:text-sm dark:text-neutral-300'
        )}
      >
        <span>
          Showing {formatNumber(filteredPlans.length)} of {formatNumber(totalPlans)} plans
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Status: {statusFilterLabel}
          </span>
          {trimmedSearch ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Search: “{trimmedSearch}”
            </span>
          ) : null}
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Active: {formatNumber(activeCount)}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Subscription: {formatNumber(autoRenewCount)}
          </span>
          {limitedCount > 0 ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Limited: {formatNumber(limitedCount)}
            </span>
          ) : null}
        </div>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {filteredPlans.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-neutral-300">
            {hasActiveFilters ? 'No plans match your filters.' : 'No plans yet. Create your first plan to get started.'}
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100/80 md:hidden dark:divide-neutral-800/80">
              {filteredPlans.map((plan) => (
                <div key={plan.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-neutral-50">{plan.name}</div>
                      {plan.shortDescription ? (
                        <p className="text-xs text-slate-500 dark:text-neutral-400">{plan.shortDescription}</p>
                      ) : null}
                      {plan.supportsOrganizations ? (
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-100">
                          Team plan
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(plan.active)}`}
                    >
                      {plan.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-neutral-300">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                      {formatCurrency(plan.priceCents)}
                    </span>
                    <span className={`rounded-full px-2 py-1 ${getPlanTypeBadgeClass(plan.autoRenew)}`}>
                      {plan.autoRenew
                        ? `Subscription · every ${formatNumber(Math.max(1, plan.recurringIntervalCount ?? 1))} ${plan.recurringInterval ?? 'interval'}${Math.max(1, plan.recurringIntervalCount ?? 1) === 1 ? '' : 's'}`
                        : `One-time · ${formatDuration(plan.durationHours)}`}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                      Subscribers: {formatNumber(plan.activeSubscriberCount)}
                    </span>
                    {plan.tokenLimit != null ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                        Token limit: {formatNumber(plan.tokenLimit)} {plan.tokenName ?? ''}
                      </span>
                    ) : null}
                    {plan.supportsOrganizations ? (
                      <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100">
                        Seats: {plan.organizationSeatLimit != null ? formatNumber(plan.organizationSeatLimit) : 'Unlimited'} ·{' '}
                        {plan.supportsOrganizations ? 'Shared pool' : '—'}
                      </span>
                    ) : null}
                  </div>
                  {getExternalPricesForPlan(plan).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {getExternalPricesForPlan(plan).map(({ provider, priceId }) => (
                        <button
                          key={`${provider}-${priceId}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(priceId);
                            showToast('Price ID copied', 'success');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          title={`Click to copy: ${provider}: ${priceId}`}
                        >
                          <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{provider}</span>
                          <span className="text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{priceId}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <IconActionButton
                      onClick={() => openEdit(plan.id)}
                      ariaLabel={`Edit plan ${plan.name}`}
                      title="Edit"
                      icon={faPen}
                      color="indigo"
                    />
                    <IconActionButton
                      onClick={() => openDuplicate(plan.id)}
                      ariaLabel={`Duplicate plan ${plan.name}`}
                      title="Duplicate"
                      icon={faCopy}
                      color="emerald"
                    />
                    <IconActionButton
                      onClick={() => togglePlanStatus(plan.id, !plan.active)}
                      ariaLabel={plan.active ? `Deactivate plan ${plan.name}` : `Activate plan ${plan.name}`}
                      title={plan.active ? 'Deactivate' : 'Activate'}
                      icon={plan.active ? faPause : faPlay}
                      variant="conditional"
                      active={plan.active}
                      activeColor="amber"
                      inactiveColor="emerald"
                      disabled={loading}
                    />
                    <IconActionButton
                      onClick={() => deletePlan(plan.id)}
                      ariaLabel={`Delete plan ${plan.name}`}
                      title="Delete"
                      icon={faTrash}
                      color="rose"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <div className="border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
                <div className="grid grid-cols-[1.6fr,1fr,1fr,1fr,1fr] gap-4">
                  <div>Plan</div>
                  <div>Pricing</div>
                  <div>Billing</div>
                  <div>Subscribers</div>
                  <div>Actions</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
                {filteredPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="grid grid-cols-[1.6fr,1fr,1fr,1fr,1fr] items-center gap-4 px-6 py-4 text-sm text-slate-700 transition-colors hover:bg-slate-50/70 dark:text-neutral-200 dark:hover:bg-neutral-900/60"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-neutral-50">{plan.name}</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(plan.active)}`}>
                          {plan.active ? 'Active' : 'Inactive'}
                        </span>
                        {plan.supportsOrganizations ? (
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-100">
                            Team
                          </span>
                        ) : null}
                      </div>
                      {plan.shortDescription ? (
                        <p className="text-xs text-slate-500 dark:text-neutral-400">{plan.shortDescription}</p>
                      ) : null}
                      {getExternalPricesForPlan(plan).length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getExternalPricesForPlan(plan).map(({ provider, priceId }) => (
                            <button
                              key={`${provider}-${priceId}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(priceId);
                                showToast('Price ID copied', 'success');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              title={`Click to copy: ${provider}: ${priceId}`}
                            >
                              <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{provider}</span>
                              <span className="text-slate-500 dark:text-slate-400 truncate max-w-[180px]">{priceId}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-neutral-100">{formatCurrency(plan.priceCents)}</div>
                      {plan.tokenLimit != null ? (
                        <div className="text-xs text-slate-500 dark:text-neutral-400">
                          Limit {formatNumber(plan.tokenLimit)} {plan.tokenName ?? ''}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-neutral-400">Unlimited tokens</div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getPlanTypeBadgeClass(plan.autoRenew)}`}>
                        {plan.autoRenew
                          ? `Subscription · every ${formatNumber(Math.max(1, plan.recurringIntervalCount ?? 1))} ${plan.recurringInterval ?? 'interval'}${Math.max(1, plan.recurringIntervalCount ?? 1) === 1 ? '' : 's'}`
                          : 'One-time'}
                      </span>
                      <div className="text-xs text-slate-500 dark:text-neutral-400">
                        {plan.autoRenew ? 'Renews automatically' : `Access: ${formatDuration(plan.durationHours)}`}
                      </div>
                    </div>

                    <div className="space-y-1 text-sm text-slate-700 dark:text-neutral-200">
                      <div className="font-semibold">{formatNumber(plan.activeSubscriberCount)}</div>
                      <div className="text-xs text-slate-500 dark:text-neutral-400">Active members</div>
                      {plan.supportsOrganizations ? (
                        <div className="text-xs text-violet-500 dark:text-violet-200">
                          Seats: {plan.organizationSeatLimit != null ? formatNumber(plan.organizationSeatLimit) : 'Unlimited'} ·{' '}
                          {plan.supportsOrganizations ? 'Shared pool' : '—'}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <IconActionButton
                        onClick={() => openEdit(plan.id)}
                        ariaLabel={`Edit plan ${plan.name}`}
                        title="Edit"
                        icon={faPen}
                        color="indigo"
                      />
                      <IconActionButton
                        onClick={() => openDuplicate(plan.id)}
                        ariaLabel={`Duplicate plan ${plan.name}`}
                        title="Duplicate"
                        icon={faCopy}
                        color="emerald"
                      />
                      <IconActionButton
                        onClick={() => togglePlanStatus(plan.id, !plan.active)}
                        ariaLabel={plan.active ? `Deactivate plan ${plan.name}` : `Activate plan ${plan.name}`}
                        title={plan.active ? 'Deactivate' : 'Activate'}
                        icon={plan.active ? faPause : faPlay}
                        variant="conditional"
                        active={plan.active}
                        activeColor="amber"
                        inactiveColor="emerald"
                        disabled={loading}
                      />
                      <IconActionButton
                        onClick={() => deletePlan(plan.id)}
                        ariaLabel={`Delete plan ${plan.name}`}
                        title="Delete"
                        icon={faTrash}
                        color="rose"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete plan"
        description="Deleting a plan will permanently remove it and all related subscriptions/payments."
        confirmLabel={forceDelete ? 'Force delete!' : 'Delete'}
        cancelLabel="Cancel"
        loading={loading}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        confirmDisabled={pendingDeleteId ? false : true}
      >
        <div className="flex items-center gap-2">
          <input id="force-delete" type="checkbox" checked={forceDelete} onChange={e => setForceDelete(e.target.checked)} className="w-4 h-4" />
          <label htmlFor="force-delete" className="text-sm text-neutral-300">I understand this will permanently delete all related subscriptions and payments (force delete)</label>
        </div>
      </ConfirmModal>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-full">
              <div className="flex items-center justify-between p-4 border-b border-neutral-800 flex-shrink-0">
                <h3 className="text-lg font-semibold text-neutral-100">{editingPlanId ? 'Edit plan' : 'New plan'}</h3>
                <button aria-label="Close" onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-100 p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                  ✕
                </button>
              </div>
              <form className="p-5 space-y-4 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); save(); }}>
                {isEditingExistingPlan ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    Interval, plan type, and duration cannot be changed after creation. Duplicate or recreate the plan instead.
                  </div>
                ) : null}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">Name</label>
                    <input className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">Price ({currencyLabel})</label>
                    <input
                      className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 19.99"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={priceDisplay}
                      onKeyDown={handlePriceKeyDown}
                      onPaste={handlePricePaste}
                      onChange={e => {
                        const v = e.target.value;
                        // Only allow characters that match digits and dot (defensive; keydown already blocks others)
                        const filtered = String(v).replace(/[^0-9.]/g, '');
                        // If multiple dots, keep the first
                        const firstDotIndex = filtered.indexOf('.');
                        const normalized = firstDotIndex === -1 ? filtered : filtered.slice(0, firstDotIndex + 1) + filtered.slice(firstDotIndex + 1).replace(/\./g, '');
                        setPriceDisplay(normalized);
                        const cents = parseCurrencyToCents(normalized);
                        if (cents !== null) setForm({ ...form, priceCents: cents });
                      }}
                      onBlur={() => {
                        // Normalize display to 2 decimal places
                        const cents = parseCurrencyToCents(priceDisplay);
                        if (cents !== null) setPriceDisplay((cents / 100).toFixed(2));
                        else setPriceDisplay((form.priceCents / 100).toFixed(2));
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                  <div>
                    <label className="block text-sm text-slate-700 mb-2 dark:text-neutral-300">Billing type</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className={`flex items-start gap-3 rounded-lg border p-3 transition ${!form.autoRenew ? 'border-blue-300 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10' : 'border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60'} ${isEditingExistingPlan ? 'opacity-70' : ''}`}>
                        <input
                          type="radio"
                          name="billing-type"
                          checked={!form.autoRenew}
                          disabled={isEditingExistingPlan}
                          onChange={() => setForm((prev) => ({ ...prev, autoRenew: false }))}
                          className="mt-1 h-4 w-4 border-slate-400 bg-white text-blue-600 focus:ring-blue-500 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-blue-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-900 dark:text-neutral-100">Non-recurring</div>
                          <p className="text-xs text-slate-600 mt-1 dark:text-neutral-400">Charge once and use duration hours to control access length.</p>
                        </div>
                      </label>
                      <label className={`flex items-start gap-3 rounded-lg border p-3 transition ${form.autoRenew ? 'border-blue-300 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10' : 'border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60'} ${isEditingExistingPlan ? 'opacity-70' : ''}`}>
                        <input
                          type="radio"
                          name="billing-type"
                          checked={form.autoRenew}
                          disabled={isEditingExistingPlan}
                          onChange={() => setForm((prev) => ({ ...prev, autoRenew: true }))}
                          className="mt-1 h-4 w-4 border-slate-400 bg-white text-blue-600 focus:ring-blue-500 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-blue-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-900 dark:text-neutral-100">Auto-renew</div>
                          <p className="text-xs text-slate-600 mt-1 dark:text-neutral-400">Charge on a recurring basis and set billing interval.</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {form.autoRenew ? (
                    <div className="space-y-2">
                      <label className="block text-sm text-slate-700 mb-1 dark:text-neutral-300">Billed every</label>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={form.recurringIntervalCount}
                          disabled={Boolean(editingPlanId) && (originalPlan?.activeSubscriberCount ?? 0) > 0}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              recurringIntervalCount: Math.max(1, Number(e.target.value || 1)),
                            })
                          }
                          className="w-full p-2.5 bg-white border border-slate-300 rounded text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-40 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100"
                        />
                        <select
                          className="w-full px-2.5 py-2.5 bg-white border border-slate-300 rounded text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100"
                          value={form.recurringInterval}
                          disabled={isEditingExistingPlan}
                          onChange={(e) => setForm((prev) => ({ ...prev, recurringInterval: e.target.value as 'day' | 'week' | 'month' | 'year' }))}
                        >
                          <option value="day">day(s)</option>
                          <option value="week">week(s)</option>
                          <option value="month">month(s)</option>
                          <option value="year">year(s)</option>
                        </select>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-neutral-400">
                        Cadence: bills every {form.recurringIntervalCount} {form.recurringInterval}(s).
                        {form.recurringInterval === 'day' && form.recurringIntervalCount < 7
                          ? ' Razorpay price creation will be skipped for this plan (daily requires interval count ≥ 7).'
                          : ''}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm text-slate-700 mb-1 dark:text-neutral-300">Duration (hours)</label>
                      <input
                        className="w-full p-2.5 bg-white border border-slate-300 rounded text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 disabled:opacity-40 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-500"
                        placeholder="Duration hours"
                        type="number"
                        value={form.durationHours}
                        disabled={isEditingExistingPlan}
                        onChange={e => setForm({ ...form, durationHours: Number(e.target.value) })}
                      />
                    </div>
                  )}

                  {isEditingExistingPlan ? (
                    <div className="rounded p-2 text-xs text-slate-600 bg-white/80 dark:bg-neutral-800/50 dark:text-neutral-400">
                      Plan type and interval are locked after creation. Interval count can be changed only when there are no active subscribers.
                    </div>
                  ) : form.autoRenew ? (
                    <div className="rounded p-2 text-xs text-slate-600 bg-white/80 dark:bg-neutral-800/50 dark:text-neutral-400">Subscription plans ignore duration hours. The provider will expect a recurring price.</div>
                  ) : (
                    <div className="rounded p-2 text-xs text-slate-600 bg-white/80 dark:bg-neutral-800/50 dark:text-neutral-400">One-time plans use duration hours and a one-time external price.</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Short Description (Plain Text)</label>
                  <input
                    className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief description for checkout and billing pages"
                    maxLength={200}
                    value={form.shortDescription}
                    onChange={e => setForm({ ...form, shortDescription: e.target.value })}
                  />
                  <div className="text-xs text-neutral-400 mt-1">
                    Plain text only. Used in checkout and billing summaries. Max 200 characters.
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Description (HTML/Rich Text)</label>
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById('plan-description') as HTMLTextAreaElement;
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const selected = form.description.substring(start, end);
                          const newText = form.description.substring(0, start) + `<strong>${selected || 'bold text'}</strong>` + form.description.substring(end);
                          setForm({ ...form, description: newText });
                          setTimeout(() => textarea.focus(), 0);
                        }}
                        className="px-2 py-1 bg-neutral-700 border border-neutral-600 rounded hover:bg-neutral-600"
                      >
                        <strong>B</strong>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById('plan-description') as HTMLTextAreaElement;
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const selected = form.description.substring(start, end);
                          const newText = form.description.substring(0, start) + `<em>${selected || 'italic text'}</em>` + form.description.substring(end);
                          setForm({ ...form, description: newText });
                          setTimeout(() => textarea.focus(), 0);
                        }}
                        className="px-2 py-1 bg-neutral-700 border border-neutral-600 rounded hover:bg-neutral-600"
                      >
                        <em>I</em>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById('plan-description') as HTMLTextAreaElement;
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const selected = form.description.substring(start, end);
                          const newText = form.description.substring(0, start) + `<span class="text-blue-400">${selected || 'highlighted text'}</span>` + form.description.substring(end);
                          setForm({ ...form, description: newText });
                          setTimeout(() => textarea.focus(), 0);
                        }}
                        className="px-2 py-1 bg-neutral-700 border border-neutral-600 rounded hover:bg-neutral-600"
                      >
                        <span className="text-blue-400">Color</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById('plan-description') as HTMLTextAreaElement;
                          const start = textarea.selectionStart;
                          const newText = form.description.substring(0, start) + `<br>` + form.description.substring(start);
                          setForm({ ...form, description: newText });
                          setTimeout(() => textarea.focus(), 0);
                        }}
                        className="px-2 py-1 bg-neutral-700 border border-neutral-600 rounded hover:bg-neutral-600"
                      >
                        Line Break
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById('plan-description') as HTMLTextAreaElement;
                          const start = textarea.selectionStart;
                          const newText = form.description.substring(0, start) + `<ul class="list-disc ml-4"><li>Item 1</li><li>Item 2</li></ul>` + form.description.substring(start);
                          setForm({ ...form, description: newText });
                          setTimeout(() => textarea.focus(), 0);
                        }}
                        className="px-2 py-1 bg-neutral-700 border border-neutral-600 rounded hover:bg-neutral-600"
                      >
                        • List
                      </button>
                    </div>
                    <textarea
                      id="plan-description"
                      className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                      placeholder="Enter HTML or plain text description"
                      rows={4}
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                    />
                    <div className="text-xs text-neutral-400">
                      You can use HTML tags like <code className="bg-neutral-700 px-1 rounded">&lt;strong&gt;</code>, <code className="bg-neutral-700 px-1 rounded">&lt;em&gt;</code>, <code className="bg-neutral-700 px-1 rounded">&lt;br&gt;</code>, or Tailwind classes for styling.
                    </div>
                    {form.description && (
                      <div className="border border-neutral-700 rounded p-3 bg-neutral-950 dark:bg-neutral-900">
                        <div className="text-xs text-neutral-400 mb-1.5">Preview:</div>
                        <div className="text-sm text-neutral-100" dangerouslySetInnerHTML={{ __html: form.description }} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-sm text-neutral-300 dark:text-neutral-300 mb-2">External price IDs</label>
                    {originalPlan && getExternalPricesForPlan(originalPlan).length > 0 ? (
                      <div className="w-full p-3 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded space-y-2">
                        {getExternalPricesForPlan(originalPlan).map(({ provider, priceId }) => (
                          <div
                            key={`${provider}-${priceId}`}
                            className="flex items-center justify-between gap-3 p-2.5 bg-white dark:bg-neutral-800/50 border border-slate-200 dark:border-transparent rounded-lg"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 capitalize">
                                {provider}
                              </span>
                              <code className="text-sm text-slate-800 dark:text-neutral-200 font-mono">{priceId}</code>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(priceId);
                                showToast('Price ID copied', 'success');
                              }}
                              className="text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="w-full p-3 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded text-slate-500 dark:text-neutral-400 text-sm text-center">
                        No external prices synced yet
                      </div>
                    )}
                    <div className="text-xs text-slate-500 dark:text-neutral-400 mt-1.5">
                      Provider IDs are tracked per provider. If some are missing, use &quot;Sync billing catalog&quot;.
                    </div>
                  </div>
                </div>

                <div className="border-t border-neutral-700 pt-4 space-y-4">
                  <h4 className="text-sm font-semibold text-green-400">Token Settings</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Token limit</label>
                      <input
                        className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500"
                        placeholder="Leave blank for unlimited tokens"
                        type="number"
                        min="0"
                        value={form.tokenLimit}
                        onChange={e => setForm({ ...form, tokenLimit: e.target.value })}
                      />
                      <p className="text-xs text-neutral-400 mt-1">Number of tokens allocated with this plan. Leave blank for unlimited.</p>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Custom token name (optional)</label>
                      <input
                        className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Credits, API Calls"
                        value={form.tokenName}
                        onChange={e => setForm({ ...form, tokenName: e.target.value })}
                      />
                      <p className="text-xs text-neutral-400 mt-1">Optional: Override the global token display name for this plan.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-neutral-700 pt-4 space-y-4">
                  <h4 className="text-sm font-semibold text-cyan-400">Team Plan Settings</h4>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 w-4 h-4 bg-neutral-800 border border-neutral-700 rounded text-blue-500 focus:ring-2 focus:ring-blue-500"
                        checked={form.supportsOrganizations}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            supportsOrganizations: e.target.checked,
                            organizationSeatLimit: e.target.checked ? prev.organizationSeatLimit : '',
                          }))
                        }
                      />
                      <div>
                        <span className="text-sm text-neutral-100 font-medium">Enable organization access</span>
                        <p className="text-xs text-neutral-400 mt-1">
                          When enabled this plan provisions a shared workspace, syncs it to Clerk (if enabled), and unlocks the team dashboard.
                        </p>
                      </div>
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-neutral-300 mb-1">Seat limit</label>
                        <input
                          className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                          placeholder="Leave blank for unlimited seats"
                          type="number"
                          min="1"
                          value={form.organizationSeatLimit}
                          disabled={!form.supportsOrganizations}
                          onChange={(e) => setForm({ ...form, organizationSeatLimit: e.target.value })}
                        />
                        <p className="text-xs text-neutral-400 mt-1">Optional cap on members who can join the workspace.</p>
                      </div>

                      <div>
                        <label className="block text-sm text-neutral-300 mb-1">Token pool strategy</label>
                        <div className="w-full p-2.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 text-sm">
                          Shared workspace pool (default)
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">Tokens always flow into a shared workspace pool for team plans.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {!isEditingExistingPlan ? (
                  <div className="border-t border-neutral-700 pt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setAdvancedBillingOverrideOpen((prev) => !prev)}
                      aria-expanded={advancedBillingOverrideOpen}
                      className="flex w-full items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
                    >
                      <div>
                        <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-400">Advanced Billing Override</h4>
                        <p className="mt-1 text-xs text-amber-800 dark:text-amber-100/90">Use only for imports, legacy migrations, or manual provider catalog control.</p>
                      </div>
                      <span className="text-lg leading-none text-amber-800 dark:text-amber-300">{advancedBillingOverrideOpen ? '−' : '+'}</span>
                    </button>
                    {advancedBillingOverrideOpen ? (
                      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-neutral-950/70">
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                          Leave this blank for the normal flow. New plans usually auto-create provider price IDs. Use this only when importing an existing provider catalog entry, migrating legacy plans, or when payment catalog auto-create is intentionally disabled.
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-sm text-slate-700 mb-1 dark:text-neutral-300">Existing provider price ID override</label>
                            <input className="w-full p-2.5 bg-white border border-slate-300 rounded text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-500" placeholder="Leave blank to auto-create" value={form.externalPriceId} onChange={e => setForm({ ...form, externalPriceId: e.target.value })} />
                          </div>
                          <div className="flex items-end">
                            <button type="button" onClick={async () => {
                              if (!form.externalPriceId) return showToast('Enter a price ID first', 'error');
                              try {
                                const res = await fetch('/api/admin/plans/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priceId: form.externalPriceId }) });
                                const json = await res.json();
                                if (!res.ok) return showToast(json?.error || 'Verify failed', 'error');
                                const recurring = json.recurring ? JSON.stringify(json.recurring) : 'one_time';
                                showToast(`Price OK: ${json.id}\nType: ${json.type}\nRecurring: ${recurring}`, 'success');
                              } catch (e) {
                                void e;
                                showToast('Verify failed', 'error');
                              }
                            }} className="rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700">Verify</button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}



                <div className="flex justify-end gap-3 pt-2 pb-2 flex-shrink-0">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-neutral-800 border border-neutral-700 text-neutral-100 rounded hover:bg-neutral-700">Cancel</button>
                  <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{editingPlanId ? 'Save' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
