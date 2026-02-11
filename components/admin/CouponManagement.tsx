"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/Toast';
import { Pagination } from '../ui/Pagination';
import usePaginatedList from '../hooks/usePaginatedList';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useFormatSettings } from '../FormatSettingsProvider';
import { formatDate } from '../../lib/formatDate';
import ListFilters from '../ui/ListFilters';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { amountToCents, centsToAmount, formatCurrency } from '../../lib/utils/currency';
// FontAwesome icons for action buttons
import { faPen, faTrash, faPlay, faPause } from '@fortawesome/free-solid-svg-icons';
import IconActionButton from '../ui/IconActionButton';

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  currency?: string | null;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths: number | null;
  minimumPurchaseCents?: number | null;
  active: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  pendingRedemptions: number;
  startsAt: string | null;
  endsAt: string | null;
  startsAtFormatted?: string | null;
  endsAtFormatted?: string | null;
  createdAtFormatted?: string | null;
  updatedAtFormatted?: string | null;
  createdAt: string;
  updatedAt: string;
  eligiblePlans: Array<{ id: string; name: string | null }>;
};

type DiscountType = 'percent' | 'amount';
type CouponDuration = 'once' | 'repeating' | 'forever';

type FormState = {
  code: string;
  description: string;
  discountType: DiscountType;
  percentOff: string;
  amountOff: string;
  currency: string;
  minimumPurchase: string;
  duration: CouponDuration;
  durationInMonths: string;
  maxRedemptions: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  planIds: string[];
};

// TODO: Accept currency prop when implementing multi-currency support
const DEFAULT_CURRENCY = 'usd';

// Combined status type for ListFilters
type CombinedStatus = 'ALL' | 'ACTIVE' | 'EXPIRED' | 'SCHEDULED' | 'PUBLISHED' | 'UNPUBLISHED';
type AccessFilter = 'all' | 'active' | 'expired' | 'scheduled';
type PublishStatus = 'all' | 'published' | 'unpublished';

type CouponStatusTone = 'active' | 'scheduled' | 'expired' | 'inactive';

const defaultFormState: FormState = {
  code: '',
  description: '',
  discountType: 'percent',
  percentOff: '10',
  amountOff: '5',
  currency: DEFAULT_CURRENCY,
  minimumPurchase: '',
  duration: 'once',
  durationInMonths: '3',
  maxRedemptions: '',
  startsAt: '',
  endsAt: '',
  active: true,
  planIds: [],
};

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

function normalizeCoupon(input: Record<string, unknown>): CouponRow {
  const record = input;
  const safeString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
  const safeNumber = (value: unknown | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  };

  const rawDuration = safeString(record.duration, 'once');
  const duration: CouponDuration = rawDuration === 'forever' || rawDuration === 'repeating' || rawDuration === 'once'
    ? rawDuration
    : 'once';

  return {
    id: safeString(record.id),
    code: safeString(record.code).toUpperCase(),
    description: typeof record.description === 'string' ? record.description : null,
    percentOff: safeNumber(record.percentOff),
    amountOffCents: safeNumber(record.amountOffCents),
    currency: typeof record.currency === 'string' ? record.currency : null,
    duration,
    durationInMonths: safeNumber(record.durationInMonths),
    minimumPurchaseCents: safeNumber(record.minimumPurchaseCents),
    active: Boolean(record.active),
    maxRedemptions: safeNumber(record.maxRedemptions),
    redemptionCount: Number(record.redemptionCount ?? 0),
    pendingRedemptions: Number(record.pendingRedemptions ?? 0),
    startsAt: typeof record.startsAt === 'string' ? record.startsAt : null,
    endsAt: typeof record.endsAt === 'string' ? record.endsAt : null,
    createdAt: safeString(record.createdAt, new Date().toISOString()),
    updatedAt: safeString(record.updatedAt, new Date().toISOString()),
    eligiblePlans: Array.isArray(record.eligiblePlans)
      ? (record.eligiblePlans as Record<string, unknown>[]).map((item) => ({
          id: safeString(item.id),
          name: typeof item.name === 'string' ? item.name : null,
        }))
      : [],
  };
}

function formatMoney(cents: number | null): string {
  if (!cents) return formatCurrency(0, DEFAULT_CURRENCY);
  return formatCurrency(cents, DEFAULT_CURRENCY);
}

type ProviderResponse = {
  activeProvider?: string;
  activeCurrency?: string;
};

const statusToneClasses: Record<CouponStatusTone, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100',
  scheduled: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-100',
  expired: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300'
};

// Color classes for Access filter tags
const accessTagClasses: Record<'active' | 'expired' | 'scheduled', string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100',
  expired: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-100'
};

// Color classes for Status (publish) filter tags
const publishStatusTagClasses: Record<'published' | 'unpublished', string> = {
  published: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-100',
  unpublished: 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-100'
};

function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoString(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getStatusLabel(coupon: CouponRow): { label: string; tone: CouponStatusTone } {
  const now = Date.now();
  const startsAt = coupon.startsAt ? new Date(coupon.startsAt).getTime() : null;
  const endsAt = coupon.endsAt ? new Date(coupon.endsAt).getTime() : null;

  // Status precedence: Scheduled / Expired take precedence over Inactive.
  // This ensures that when a coupon has expired it is shown as "Expired"
  // even if it was manually paused (inactive). Previously Inactive was
  // checked first which hid Expired state for paused coupons.
  if (startsAt && startsAt > now) {
    return { label: 'Scheduled', tone: 'scheduled' };
  }
  if (endsAt && endsAt < now) {
    return { label: 'Expired', tone: 'expired' };
  }
  if (!coupon.active) {
    return { label: 'Inactive', tone: 'inactive' };
  }
  return { label: 'Active', tone: 'active' };
}

function getAccessLabel(coupon: CouponRow): string {
  const now = Date.now();
  const startsAt = coupon.startsAt ? new Date(coupon.startsAt).getTime() : null;
  const endsAt = coupon.endsAt ? new Date(coupon.endsAt).getTime() : null;

  // Active - within expiry date (startsAt <= now < endsAt)
  if (startsAt && startsAt <= now && endsAt && endsAt > now) {
    return 'Active';
  }
  // Expired - past expiry date (endsAt <= now)
  if (endsAt && endsAt <= now) {
    return 'Expired';
  }
  // Scheduled - yet to reach start date (startsAt > now)
  if (startsAt && startsAt > now) {
    return 'Scheduled';
  }
  // Default fallback for coupons without proper dates
  return 'Active';
}

function getPublishStatusLabel(coupon: CouponRow): string {
  // Published - not manually paused (active = true)
  // Unpublished - manually paused (active = false)
  return coupon.active ? 'Published' : 'Unpublished';
}

function getDurationBadge(coupon: CouponRow): { label: string; title: string } {
  if (coupon.duration === 'forever') {
    return { label: 'Forever', title: 'Applies to every renewal' };
  }

  if (coupon.duration === 'repeating') {
    const months = typeof coupon.durationInMonths === 'number' && coupon.durationInMonths > 0
      ? coupon.durationInMonths
      : null;
    return {
      label: months ? `Repeat · ${months} mo` : 'Repeat',
      title: months
        ? `Applies for the first ${months} renewal invoices (provider support varies)`
        : 'Applies for a fixed number of months (provider support varies)',
    };
  }

  return { label: 'Once', title: 'Applies to the first charge only' };
}

interface CouponManagementProps {
  initialCoupons: CouponRow[];
  initialTotalCount: number;
  initialPage: number;
  pageSize?: number;
  initialSearch?: string;
  initialAccess?: AccessFilter;
  initialPublishStatus?: PublishStatus;
  statusTotals?: Record<string, number>;
}

// Helper to convert combined status to access + publish status
function parseStatus(combined: CombinedStatus): { access: AccessFilter; status: PublishStatus } {
  switch (combined) {
    case 'ACTIVE':
      return { access: 'active', status: 'all' };
    case 'EXPIRED':
      return { access: 'expired', status: 'all' };
    case 'SCHEDULED':
      return { access: 'scheduled', status: 'all' };
    case 'PUBLISHED':
      return { access: 'all', status: 'published' };
    case 'UNPUBLISHED':
      return { access: 'all', status: 'unpublished' };
    default:
      return { access: 'all', status: 'all' };
  }
}

// Helper to convert access + publish status to combined status
function combineStatus(access: AccessFilter, status: PublishStatus): CombinedStatus {
  if (access !== 'all') {
    return access.toUpperCase() as CombinedStatus;
  }
  if (status !== 'all') {
    return status.toUpperCase() as CombinedStatus;
  }
  return 'ALL';
}

export function CouponManagement({
  initialCoupons,
  initialTotalCount,
  initialPage,
  pageSize = 50,
  initialSearch = '',
  initialAccess = 'all',
  initialPublishStatus = 'all',
  statusTotals,
}: CouponManagementProps) {
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>(initialAccess);
  const [publishStatusFilter, setPublishStatusFilter] = useState<PublishStatus>(initialPublishStatus);
  const [sortBy, setSortBy] = useState<'createdAt' | 'startsAt' | 'endsAt' | 'redemptionCount' | 'maxRedemptions'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const debouncedSearch = useDebouncedValue(searchValue, 400);

  const {
    items: coupons,
    setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
    refresh,
  } = usePaginatedList<CouponRow>({
    basePath: '/api/admin/coupons',
    initialItems: initialCoupons,
    initialTotalCount,
    initialPage,
    itemsPerPage: pageSize,
    filters: {
      search: debouncedSearch || undefined,
      access: accessFilter !== 'all' ? accessFilter : undefined,
      status: publishStatusFilter !== 'all' ? publishStatusFilter : undefined,
      sortBy,
      sortOrder,
    },
    itemsKey: 'coupons',
  });

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [activeCurrency, setActiveCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [showPlanLimits, setShowPlanLimits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncingProviders, setSyncingProviders] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [planOptions, setPlanOptions] = useState<Array<{ id: string; name: string; active: boolean }>>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planLoadError, setPlanLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchPlans() {
      setPlansLoading(true);
      setPlanLoadError(null);
      try {
        const res = await fetch('/api/admin/plans', { signal: controller.signal });
        if (!res.ok) {
          throw new Error('Failed to load plans');
        }
        const json = await res.json();
        if (!Array.isArray(json)) {
          throw new Error('Unexpected plan response');
        }
        setPlanOptions(
          json
            .map((item: Record<string, unknown>) => ({
              id: typeof item.id === 'string' ? item.id : '',
              name: typeof item.name === 'string' ? item.name : 'Untitled plan',
              active: Boolean(item.active),
            }))
            .filter((plan) => plan.id.length > 0)
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setPlanLoadError((error as Error).message || 'Failed to load plans');
        }
      } finally {
        setPlansLoading(false);
      }
    }

    void fetchPlans();
    return () => controller.abort();
  }, []);

  const settings = useFormatSettings();

  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : Math.max(1, currentPage + (nextCursor ? 1 : 0));
  const trimmedSearch = searchValue.trim();

    useEffect(() => {
      let mounted = true;
      void (async () => {
        try {
          const res = await fetch('/api/admin/payment-providers');
          const json = (await res.json().catch(() => ({}))) as ProviderResponse;
          const nextCurrency = typeof json.activeCurrency === 'string' && json.activeCurrency.trim()
            ? json.activeCurrency.trim().toLowerCase()
            : DEFAULT_CURRENCY;
          if (!mounted) return;
          setActiveCurrency(nextCurrency);
          setForm((prev) => ({ ...prev, currency: prev.currency || nextCurrency }));
        } catch {
          // Ignore; fallback to DEFAULT_CURRENCY.
        }
      })();
      return () => {
        mounted = false;
      };
    }, []);
  const hasActiveFilters = Boolean(trimmedSearch) || accessFilter !== 'all' || publishStatusFilter !== 'all';
  const deletingCoupon = pendingDeleteId ? coupons.find((item) => item.id === pendingDeleteId) : null;
  const hasDeletionHistory = Boolean(
    (deletingCoupon?.redemptionCount ?? 0) > 0 || (deletingCoupon?.pendingRedemptions ?? 0) > 0
  );

  const handleFilterChange = (value: string) => {
    setSearchValue(value);
  };

  const handleStatusChange = (value: string) => {
    const { access, status } = parseStatus(value.toUpperCase() as CombinedStatus);
    setAccessFilter(access);
    setPublishStatusFilter(status);
    fetchPage(1);
  };

  const handleRefresh = () => {
    refresh();
  };

  const syncProviders = async () => {
    setSyncingProviders(true);
    try {
      const res = await fetch('/api/admin/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'coupons' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json?.error || 'Failed to sync coupons across providers', 'error');
        return;
      }
      showToast('Providers synced (coupons)', 'success');
      refresh();
    } catch {
      showToast('Network error syncing providers', 'error');
    } finally {
      setSyncingProviders(false);
    }
  };

  const formatScheduleRange = (coupon: CouponRow) => {
    // Prefer server-provided formatted values when available to avoid hydration mismatches
    const startLabel = coupon.startsAtFormatted ?? (coupon.startsAt
      ? formatDate(coupon.startsAt, { mode: 'datetime', timezone: settings.timezone })
      : 'Immediate');
    const endLabel = coupon.endsAtFormatted ?? (coupon.endsAt
      ? formatDate(coupon.endsAt, { mode: 'datetime', timezone: settings.timezone })
      : null);
    return endLabel ? `${startLabel} → ${endLabel}` : startLabel;
  };

  const accessFilterLabel =
    accessFilter === 'all'
      ? 'All'
      : accessFilter === 'active'
      ? 'Active'
      : accessFilter === 'expired'
      ? 'Expired'
      : 'Scheduled';

  const publishStatusFilterLabel =
    publishStatusFilter === 'all'
      ? 'All'
      : publishStatusFilter === 'published'
      ? 'Published'
      : 'Unpublished';

  const limitedOnPage = useMemo(
    () => coupons.filter((coupon) => coupon.maxRedemptions !== null).length,
    [coupons]
  );

  const pendingOnPage = useMemo(
    () => coupons.reduce((acc, coupon) => acc + coupon.pendingRedemptions, 0),
    [coupons]
  );

  function resetForm() {
    setForm(() => ({ ...defaultFormState, currency: activeCurrency || DEFAULT_CURRENCY, planIds: [] }));
    setShowPlanLimits(false);
  }

  function openCreate() {
    setEditingId(null);
    resetForm();
    setShowModal(true);
  }

  function openEdit(id: string) {
    const coupon = coupons.find((item) => item.id === id);
    if (!coupon) return;
    setEditingId(id);
    const couponCurrency = (coupon.currency || activeCurrency || DEFAULT_CURRENCY).toLowerCase();
    setForm({
      code: coupon.code,
      description: coupon.description ?? '',
      discountType: coupon.percentOff !== null ? 'percent' : 'amount',
      percentOff: coupon.percentOff !== null ? String(coupon.percentOff) : '',
      amountOff:
        coupon.amountOffCents !== null
          ? String(centsToAmount(coupon.amountOffCents, couponCurrency))
          : '',
      currency: couponCurrency,
      minimumPurchase:
        typeof coupon.minimumPurchaseCents === 'number' && coupon.minimumPurchaseCents > 0
          ? String(centsToAmount(coupon.minimumPurchaseCents, couponCurrency))
          : '',
      duration: coupon.duration,
      durationInMonths: coupon.durationInMonths !== null ? String(coupon.durationInMonths) : defaultFormState.durationInMonths,
      maxRedemptions: coupon.maxRedemptions !== null ? String(coupon.maxRedemptions) : '',
      startsAt: toLocalInput(coupon.startsAt),
      endsAt: toLocalInput(coupon.endsAt),
      active: coupon.active,
      planIds: coupon.eligiblePlans.map((plan) => plan.id).filter((value) => value.length > 0),
    });
    setShowPlanLimits(coupon.eligiblePlans.length > 0);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  function validateForm(): string | null {
    if (!form.code.trim()) return 'Coupon code is required';
    if (!/^[A-Z0-9-]{3,64}$/.test(form.code.trim().toUpperCase())) return 'Coupon code must be 3-64 characters (A-Z, 0-9, dash).';
    if (form.discountType === 'percent') {
      const percent = Number(form.percentOff);
      if (Number.isNaN(percent) || percent <= 0 || percent > 100) return 'Percent off must be between 1 and 100.';
    } else {
      const amount = Number(form.amountOff);
      if (Number.isNaN(amount) || amount <= 0) return 'Amount off must be greater than 0.';
    }

    if (form.minimumPurchase.trim()) {
      const minimum = Number(form.minimumPurchase);
      if (Number.isNaN(minimum) || minimum <= 0) return 'Minimum purchase must be greater than 0.';
    }

    if (form.duration === 'repeating') {
      const months = Number(form.durationInMonths);
      if (!Number.isFinite(months) || months <= 0 || !Number.isInteger(months)) {
        return 'Duration months must be a whole number greater than 0.';
      }
      if (months > 36) {
        return 'Duration months must be 36 or less.';
      }
    }

    if (form.startsAt && Number.isNaN(new Date(form.startsAt).getTime())) return 'Start date is invalid';
    if (form.endsAt && Number.isNaN(new Date(form.endsAt).getTime())) return 'End date is invalid';
    if (form.startsAt && form.endsAt) {
      const start = new Date(form.startsAt).getTime();
      const end = new Date(form.endsAt).getTime();
      if (end < start) return 'End date must be after start date';
    }
    if (form.maxRedemptions) {
      const max = Number(form.maxRedemptions);
      if (Number.isNaN(max) || max <= 0) return 'Max redemptions must be greater than 0.';
    }
    return null;
  }

  async function toggleActive(id: string, active: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/coupons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json?.error || 'Failed to update coupon', 'error');
        return;
      }

      const updated = normalizeCoupon(json.coupon as Record<string, unknown>);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      showToast(`Coupon ${active ? 'activated' : 'deactivated'}`, 'success');
    } catch {
      showToast('Network error updating coupon', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openDelete(id: string) {
    const coupon = coupons.find((item) => item.id === id);
    setPendingDeleteId(id);
    setForceDelete(false);
    if (coupon && (coupon.redemptionCount > 0 || coupon.pendingRedemptions > 0)) {
      setDeleteWarning('This coupon has redemption history. You may need to force delete to remove it.');
    } else {
      setDeleteWarning(null);
    }
    setDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setDeleteModalOpen(false);
    setPendingDeleteId(null);
    setForceDelete(false);
    setDeleteWarning(null);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setLoading(true);
    try {
      const endpoint = `/api/admin/coupons/${pendingDeleteId}${forceDelete ? '?force=1' : ''}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage = json?.requiresForce
          ? 'Coupon has redemptions. Enable "Force delete" to remove it.'
          : typeof json?.error === 'string'
            ? json.error
            : 'Unable to delete coupon';
        showToast(errorMessage, 'error');
        if (json?.requiresForce) {
          setDeleteWarning('This coupon has redemption history. Enable "Force delete" to remove it along with all redemptions.');
          setForceDelete(true);
        }
        return;
      }
      const nextPage = coupons.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await fetchPage(nextPage);
      const forced = Boolean(json?.forced);
      showToast(forced ? 'Coupon force deleted' : 'Coupon deleted', 'success');
      closeDeleteModal();
    } catch {
      showToast('Network error deleting coupon', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function saveCoupon() {
    const validation = validateForm();
    if (validation) {
      showToast(validation, 'error');
      return;
    }
    setLoading(true);
    try {
      const currency = (form.currency || activeCurrency || DEFAULT_CURRENCY).trim().toLowerCase();
      if (editingId) {
        const payload: Record<string, unknown> = {
          description: form.description || null,
          active: form.active,
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
          startsAt: form.startsAt ? toIsoString(form.startsAt) : null,
          endsAt: form.endsAt ? toIsoString(form.endsAt) : null,
        };

        if (form.minimumPurchase.trim()) {
          payload.currency = currency;
          payload.minimumPurchaseCents = amountToCents(Number(form.minimumPurchase), currency);
        } else {
          payload.minimumPurchaseCents = null;
        }
        const res = await fetch(`/api/admin/coupons/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json?.error || 'Failed to update coupon', 'error');
          return;
        }
        const updated = normalizeCoupon(json.coupon as Record<string, unknown>);
        setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
        showToast('Coupon updated', 'success');
      } else {
        const payload: Record<string, unknown> = {
          code: form.code.trim().toUpperCase(),
          description: form.description || null,
          active: form.active,
          duration: form.duration,
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
          startsAt: form.startsAt ? toIsoString(form.startsAt) : null,
          endsAt: form.endsAt ? toIsoString(form.endsAt) : null,
        };

        if (form.duration === 'repeating') {
          payload.durationInMonths = Number(form.durationInMonths);
        }

        if (form.discountType === 'percent') {
          payload.percentOff = Number(form.percentOff);
        } else {
          payload.currency = currency;
          payload.amountOffCents = amountToCents(Number(form.amountOff), currency);
        }

        if (form.minimumPurchase.trim()) {
          payload.currency = payload.currency || currency;
          payload.minimumPurchaseCents = amountToCents(Number(form.minimumPurchase), currency);
        }
        if (form.planIds.length > 0) {
          payload.planIds = form.planIds;
        }
        const res = await fetch('/api/admin/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json?.error || 'Failed to create coupon', 'error');
          return;
        }
        await fetchPage(1);
        showToast('Coupon created', 'success');
      }
      closeModal();
    } catch {
      showToast('Network error saving coupon', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* status cards removed - using a cleaner list view for coupons */}

      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={searchValue}
          onSearchChange={handleFilterChange}
          statusOptions={['ALL', 'ACTIVE', 'EXPIRED', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED']}
          currentStatus={combineStatus(accessFilter, publishStatusFilter)}
          onStatusChange={handleStatusChange}
          sortOptions={[
            { value: 'createdAt', label: 'Created' },
            { value: 'startsAt', label: 'Start date' },
            { value: 'endsAt', label: 'End date' },
            { value: 'redemptionCount', label: 'Used' },
            { value: 'maxRedemptions', label: 'Remaining' }
          ]}
          sortBy={sortBy}
          onSortByChange={(by) => setSortBy(by as typeof sortBy)}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onRefresh={handleRefresh}
          placeholder="Search by code, description, plan, or external coupon ID..."
          trailingContent={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={syncProviders}
                disabled={syncingProviders}
                title="Backfill missing coupon artifacts across all configured payment providers"
                className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 dark:focus-visible:outline-slate-700"
              >
                {syncingProviders ? 'Syncing…' : 'Sync providers'}
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white text-actual-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                New coupon
              </button>
            </div>
          }
          statusTotals={statusTotals}
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:text-sm dark:text-neutral-300'
        )}
      >
        <span>
          Showing {formatNumber(coupons.length)} of{' '}
          {formatNumber(typeof totalCount === 'number' ? totalCount : coupons.length)} coupons
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Access: {accessFilterLabel}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Status: {publishStatusFilterLabel}
          </span>
          {trimmedSearch ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Search: “{trimmedSearch}”
            </span>
          ) : null}
          {limitedOnPage > 0 ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              {formatNumber(limitedOnPage)} limited codes
            </span>
          ) : null}
          {pendingOnPage > 0 ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              {formatNumber(pendingOnPage)} pending uses
            </span>
          ) : null}
          {/* Refresh handled in the ListFilters control — removed duplicate button here */}
        </div>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {coupons.length === 0 ? (
          isLoading ? (
            <div className="space-y-4 p-6">
              <div className="h-20 animate-pulse rounded-xl bg-slate-100/80 dark:bg-neutral-800/60" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-100/80 dark:bg-neutral-800/60" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-100/80 dark:bg-neutral-800/60" />
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-neutral-300">
              {hasActiveFilters
                ? 'No coupons match your filters.'
                : 'No coupons found yet. Create a code to get started.'}
            </div>
          )
        ) : (
          <>
            <div className="divide-y divide-slate-100/80 md:hidden dark:divide-neutral-800/80">
              {coupons.map((coupon) => {
                const status = getStatusLabel(coupon);
                const discountLabel =
                  coupon.percentOff !== null ? `${coupon.percentOff}% off` : formatMoney(coupon.amountOffCents);
                const durationBadge = getDurationBadge(coupon);
                const scheduleLabel = formatScheduleRange(coupon);
                const eligiblePlans =
                  coupon.eligiblePlans.length > 0
                    ? coupon.eligiblePlans.map((plan) => plan.name || 'Unnamed plan').join(', ')
                    : 'All plans';
                
                // Compute remaining redemptions when max is set
                const remaining = coupon.maxRedemptions !== null ? Math.max((coupon.maxRedemptions ?? 0) - (coupon.redemptionCount ?? 0), 0) : null;

                return (
                  <div key={coupon.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-neutral-50">{coupon.code}</div>
                        {coupon.description ? (
                          <p className="text-xs text-slate-500 dark:text-neutral-400">{coupon.description}</p>
                        ) : null}
                      </div>
                      {/* status badge moved to actions row on mobile */}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-neutral-300">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">{discountLabel}</span>
                      <span
                        title={durationBadge.title}
                        className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100"
                      >
                        {durationBadge.label}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                        <span className="font-semibold">Used:</span> {coupon.redemptionCount}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''} · <span className="font-semibold">Pending:</span> {coupon.pendingRedemptions} · <span className="font-semibold">Remaining:</span> {remaining !== null ? remaining : '∞'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-neutral-400">Eligible plans: {eligiblePlans}</div>
                    <div className="flex items-center text-xs text-slate-500 dark:text-neutral-400">
                      <div>Schedule: {scheduleLabel || 'N/A'}</div>
                      <span className={`ml-auto inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${publishStatusTagClasses[getPublishStatusLabel(coupon).toLowerCase() as 'published' | 'unpublished']}`}>
                        {getPublishStatusLabel(coupon)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex flex-wrap gap-2">
                        <IconActionButton
                          onClick={() => openEdit(coupon.id)}
                          ariaLabel={`Edit coupon ${coupon.code}`}
                          title="Edit"
                          icon={faPen}
                          color="indigo"
                        />
                        <IconActionButton
                          onClick={() => toggleActive(coupon.id, !coupon.active)}
                          ariaLabel={coupon.active ? `Deactivate coupon ${coupon.code}` : `Activate coupon ${coupon.code}`}
                          title={coupon.active ? 'Deactivate' : 'Activate'}
                          icon={coupon.active ? faPause : faPlay}
                          variant="conditional"
                          active={coupon.active}
                          activeColor="amber"
                          inactiveColor="emerald"
                          disabled={loading || (status.tone === 'expired' && coupon.active)}
                        />
                        <IconActionButton
                          onClick={() => openDelete(coupon.id)}
                          ariaLabel={`Delete coupon ${coupon.code}`}
                          title="Delete"
                          icon={faTrash}
                          color="rose"
                          disabled={loading}
                        />
                      </div>

                      <span className={`ml-auto inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusToneClasses[status.tone]}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block">
              <div className="border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
                <div className="grid grid-cols-[1.6fr,1fr,0.8fr,0.8fr,1fr,1fr,1.2fr] gap-4">
                  <div>Code</div>
                  <div>Discount</div>
                  <div>Access</div>
                  <div>Status</div>
                  <div>Redemptions</div>
                  <div>Schedule</div>
                  <div>Actions</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
                {coupons.map((coupon) => {
                  const status = getStatusLabel(coupon);
                  const discountLabel =
                    coupon.percentOff !== null ? `${coupon.percentOff}% off` : formatMoney(coupon.amountOffCents);
                  const durationBadge = getDurationBadge(coupon);
                  const scheduleLabel = formatScheduleRange(coupon);
                  const accessLabel = getAccessLabel(coupon);
                  const publishStatusLabel = getPublishStatusLabel(coupon);
                      const eligiblePlans =
                    coupon.eligiblePlans.length > 0
                      ? coupon.eligiblePlans.map((plan) => plan.name || 'Unnamed plan').join(', ')
                      : 'All plans';

                      // Compute remaining redemptions when max is set
                      const remaining = coupon.maxRedemptions !== null ? Math.max((coupon.maxRedemptions ?? 0) - (coupon.redemptionCount ?? 0), 0) : null;
                      const remainingDisplay = remaining !== null ? formatNumber(remaining) : '∞';

                  return (
                    <div
                      key={coupon.id}
                      className="grid grid-cols-[1.6fr,1fr,0.8fr,0.8fr,1fr,1fr,1.2fr] items-center gap-4 px-6 py-4 text-sm text-slate-700 transition-colors hover:bg-slate-50/70 dark:text-neutral-200 dark:hover:bg-neutral-900/60"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-neutral-50">{coupon.code}</div>
                        {coupon.description ? (
                          <p className="text-xs text-slate-500 dark:text-neutral-400">{coupon.description}</p>
                        ) : null}
                        <p className="text-xs text-slate-500 dark:text-neutral-400">Eligible: {eligiblePlans}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                          {discountLabel}
                        </span>
                        <span
                          title={durationBadge.title}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-neutral-800 dark:text-neutral-100"
                        >
                          {durationBadge.label}
                        </span>
                      </div>

                      <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide w-fit ${accessTagClasses[accessLabel.toLowerCase() as 'active' | 'expired' | 'scheduled']}`}>
                        {accessLabel}
                      </span>

                      <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide w-fit ${publishStatusTagClasses[publishStatusLabel.toLowerCase() as 'published' | 'unpublished']}`}>
                        {publishStatusLabel}
                      </span>

                      <div className="text-xs text-slate-500 dark:text-neutral-400 space-y-0.5">
                        <div className="text-slate-700 dark:text-neutral-200">
                          <span className="font-semibold">Used:</span> {formatNumber(coupon.redemptionCount)}{coupon.maxRedemptions ? ` / ${formatNumber(coupon.maxRedemptions)}` : ''}
                        </div>
                        <div className="text-slate-700 dark:text-neutral-200">
                          <span className="font-semibold">Pending:</span> {formatNumber(coupon.pendingRedemptions)}
                        </div>
                        <div className="text-slate-700 dark:text-neutral-200">
                          <span className="font-semibold">Remaining:</span> {remainingDisplay}
                        </div>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-neutral-400">{scheduleLabel || 'N/A'}</div>

                      <div className="flex flex-wrap gap-2">
                        <IconActionButton
                          onClick={() => openEdit(coupon.id)}
                          ariaLabel={`Edit coupon ${coupon.code}`}
                          title="Edit"
                          icon={faPen}
                          color="indigo"
                        />
                        <IconActionButton
                          onClick={() => toggleActive(coupon.id, !coupon.active)}
                          ariaLabel={coupon.active ? `Deactivate coupon ${coupon.code}` : `Activate coupon ${coupon.code}`}
                          title={coupon.active ? 'Deactivate' : 'Activate'}
                          icon={coupon.active ? faPause : faPlay}
                          variant="conditional"
                          active={coupon.active}
                          activeColor="amber"
                          inactiveColor="emerald"
                          disabled={loading || (status.tone === 'expired' && coupon.active)}
                        />
                        <IconActionButton
                          onClick={() => openDelete(coupon.id)}
                          ariaLabel={`Delete coupon ${coupon.code}`}
                          title="Delete"
                          icon={faTrash}
                          color="rose"
                          disabled={loading}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {(totalPages > 1 || nextCursor) && (
        <div className={dashboardPanelClass('p-4 sm:p-6')}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page) => fetchPage(page)}
            totalItems={typeof totalCount === 'number' ? totalCount : coupons.length}
            itemsPerPage={pageSize}
            nextCursor={nextCursor}
            onNextWithCursor={(cursor) => fetchPage(currentPage + 1, false, cursor)}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete coupon"
        description="Deleting a coupon cannot be undone. Force deleting will also remove redemption history."
        confirmLabel={forceDelete ? 'Force delete coupon' : 'Delete coupon'}
        cancelLabel="Cancel"
        loading={loading}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        confirmDisabled={!pendingDeleteId}
      >
        <div className="space-y-3">
          {deleteWarning && (
            <div className="rounded border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {deleteWarning}
            </div>
          )}
          {hasDeletionHistory && deletingCoupon && (
            <div className="rounded border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-neutral-200">
              <p>
                This coupon has
                {' '}
                <strong>{deletingCoupon.redemptionCount}</strong>
                {' '}
                completed and
                {' '}
                <strong>{deletingCoupon.pendingRedemptions}</strong>
                {' '}
                pending redemptions.
              </p>
              <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-400">
                Force deleting will remove all redemption records and deactivate the code immediately across the payment provider.
              </p>
            </div>
          )}
          <label className="flex items-start gap-3 text-sm text-neutral-900 dark:text-neutral-200">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-neutral-400 bg-white text-red-600 focus:ring-red-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-red-500"
              checked={forceDelete}
              onChange={(event) => setForceDelete(event.target.checked)}
            />
            <span>
              Force delete coupon
              <span className="mt-1 block text-xs text-neutral-600 dark:text-neutral-400">
                Removes all redemption history and disables any linked provider promotion artifacts. For Paddle, the stored “promotion id” is the Paddle discount id (dsc_...).
              </span>
            </span>
          </label>
        </div>
      </ConfirmModal>

        {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center py-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl mx-4 max-h-[90vh]">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                <h3 className="text-lg font-semibold text-neutral-100">{editingId ? 'Edit coupon' : 'New coupon'}</h3>
                <button
                  aria-label="Close"
                  onClick={closeModal}
                  className="text-neutral-400 hover:text-neutral-200 p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  ✕
                </button>
              </div>
              <form
                className="p-5 space-y-4 overflow-y-auto"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveCoupon();
                }}
              >
                {!editingId && (
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">Coupon code</label>
                    <input
                      className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500 uppercase"
                      placeholder="WELCOME2024"
                      value={form.code}
                      onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Description</label>
                  <input
                    className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional description"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>

                {!editingId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-sm text-neutral-300 mb-2">
                        <input
                          type="radio"
                          name="discount-type"
                          checked={form.discountType === 'percent'}
                          onChange={() => setForm((prev) => ({ ...prev, discountType: 'percent' }))}
                        />
                        Percent off
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:ring-2 focus:ring-blue-500"
                        value={form.percentOff}
                        onChange={(event) => setForm((prev) => ({ ...prev, percentOff: event.target.value }))}
                        disabled={form.discountType !== 'percent'}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm text-neutral-300 mb-2">
                        <input
                          type="radio"
                          name="discount-type"
                          checked={form.discountType === 'amount'}
                          onChange={() => setForm((prev) => ({ ...prev, discountType: 'amount' }))}
                        />
                        Amount off (currency)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:ring-2 focus:ring-blue-500"
                        value={form.amountOff}
                        onChange={(event) => setForm((prev) => ({ ...prev, amountOff: event.target.value }))}
                        disabled={form.discountType !== 'amount'}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">Currency</label>
                    <input
                      className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                      value={(form.currency || activeCurrency || DEFAULT_CURRENCY).toUpperCase()}
                      disabled
                      readOnly
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Amount-off and minimum purchase are validated against the active provider currency.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">Minimum purchase (optional)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                      value={form.minimumPurchase}
                      onChange={(event) => setForm((prev) => ({ ...prev, minimumPurchase: event.target.value }))}
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Customers must meet this pre-discount subtotal to apply the coupon.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div
                    className={`grid grid-cols-1 ${
                      form.duration === 'repeating' ? 'md:grid-cols-2' : 'md:grid-cols-1'
                    } gap-4`}
                  >
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">Duration type</label>
                      <select
                        value={form.duration}
                        disabled={Boolean(editingId)}
                        onChange={(event) => {
                          const next = event.target.value as CouponDuration;
                          setForm((prev) => ({
                            ...prev,
                            duration: next,
                            durationInMonths: next === 'repeating' ? (prev.durationInMonths || defaultFormState.durationInMonths) : prev.durationInMonths,
                          }));
                        }}
                        className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                      >
                        <option value="once">One-time (first charge only)</option>
                        <option value="forever">Forever (every renewal)</option>
                        <option value="repeating">Repeating (N months)</option>
                      </select>
                    </div>
                    {form.duration === 'repeating' ? (
                      <div>
                        <label className="block text-sm text-neutral-300 mb-1">Duration (months)</label>
                        <input
                          type="number"
                          min={1}
                          max={36}
                          step={1}
                          value={form.durationInMonths}
                          disabled={Boolean(editingId)}
                          onChange={(event) => setForm((prev) => ({ ...prev, durationInMonths: event.target.value }))}
                          className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                        />
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs text-neutral-500">
                    One-time applies to the first payment only. Forever applies to every recurring renewal. Repeating applies for a fixed number of months (provider support varies).  Razorpay subscriptions in this app require <span className="font-semibold">Forever</span> to apply discounts on renewals.
                  </p>

                  {form.duration === 'repeating' ? (
                    <div className="text-xs text-neutral-500">
                      Example: “3 months” means the discount applies to the first 3 renewal invoices.
                    </div>
                  ) : null}

                  {editingId ? (
                    <p className="text-xs text-neutral-500">Duration can’t be changed after creation.</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="block text-neutral-300 mb-1">Start date</label>
                    <input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
                      className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-100"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-300 mb-1">End date</label>
                    <input
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                      className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-100"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-300 mb-1">Max redemptions</label>
                    <input
                      type="number"
                      min={1}
                      value={form.maxRedemptions}
                      onChange={(event) => setForm((prev) => ({ ...prev, maxRedemptions: event.target.value }))}
                      className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-100"
                      placeholder="Unlimited"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                    className="w-4 h-4 bg-neutral-800 border border-neutral-700 rounded text-blue-500"
                  />
                  Coupon is active
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm text-neutral-300">Limit to plans</label>
                    <div className="flex items-center gap-2">
                      {plansLoading && <span className="text-xs text-neutral-500">Loading…</span>}
                      <button
                        type="button"
                        onClick={() => setShowPlanLimits((prev) => !prev)}
                        aria-expanded={showPlanLimits}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
                      >
                        <span aria-hidden>
                          {showPlanLimits ? '▾' : '▸'}
                        </span>
                        {showPlanLimits ? 'Hide plan list' : 'Show plan list'}
                      </button>
                    </div>
                  </div>
                  {planLoadError && (
                    <div className="text-xs text-red-400">{planLoadError}</div>
                  )}
                  {showPlanLimits ? (
                    <div className="max-h-44 overflow-y-auto border border-neutral-800 rounded-md divide-y divide-neutral-800">
                      {planOptions.length === 0 && !plansLoading ? (
                        <div className="p-3 text-xs text-neutral-500">No plans available.</div>
                      ) : (
                        planOptions.map((plan) => {
                          const checked = form.planIds.includes(plan.id);
                          const disabled = Boolean(editingId);
                          return (
                            <label
                              key={plan.id}
                              className={`flex items-center justify-between gap-3 p-3 text-sm ${disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-neutral-800/60'}`}
                            >
                              <div className="flex flex-col">
                                <span className="text-neutral-100">{plan.name}</span>
                                <span className="text-xs text-neutral-500">{plan.active ? 'Active' : 'Inactive'}</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={(event) => {
                                  const { checked: next } = event.target;
                                  setForm((prev) => {
                                    if (disabled) return prev;
                                    const nextPlanIds = new Set(prev.planIds);
                                    if (next) {
                                      nextPlanIds.add(plan.id);
                                    } else {
                                      nextPlanIds.delete(plan.id);
                                    }
                                    return { ...prev, planIds: Array.from(nextPlanIds) };
                                  });
                                }}
                                className="w-4 h-4"
                              />
                            </label>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                  <p className="text-xs text-neutral-500">
                    {form.planIds.length === 0
                      ? 'No restrictions means the coupon works for any plan.'
                      : `${form.planIds.length} plan${form.planIds.length === 1 ? '' : 's'} selected.`}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                        onClick={closeModal}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded hover:bg-slate-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editingId ? 'Save changes' : 'Create coupon'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
