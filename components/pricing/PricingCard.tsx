"use client";
import Link from 'next/link';
import React, { useTransition, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCheck, faClock, faArrowRotateRight, faBolt, faInfinity, faUsers, faCoins, faUser, faShield } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '../ui/Toast';
import { formatPrice } from '../../lib/plans-shared';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';
import { asRecord } from '../../lib/runtime-guards';
import { getPlanTokenAllowanceLabel, getTeamTokenPoolStrategyLabel, isMemberLockedTeamWorkspace } from './pricing-card-guards';
import {
  createEmptyActiveRecurringPlansByFamily,
  createEmptyScheduledPlanIdsByFamily,
  getPricingPlanFamily,
  type ActiveRecurringPlansByFamily,
  type ScheduledPlanIdsByFamily,
} from '../../lib/pricing-card-status';
import { buildProrationSuccessMessage } from './proration-feedback';
import { AuthSignIn, AuthSignUp, useAuthUser } from '@/lib/auth-provider/client';
import { getAuthFormAppearance } from '@/lib/auth-provider/client/clerk-appearance';
import { useRouter } from 'next/navigation';

type DBPlan = {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  durationHours: number;
  isLifetime?: boolean | null;
  autoRenew: boolean;
  recurringInterval?: string | null;
  tokenLimit?: number | null;
  tokenName?: string | null;
  supportsOrganizations?: boolean | null;
  organizationSeatLimit?: number | null;
  organizationTokenPoolStrategy?: string | null;
};

type CouponOption = {
  id: string;
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
};

type ProrationLineItem = {
  id: string | null;
  description: string | null;
  amount: number;
  proration: boolean;
};

type ProrationPreview = {
  prorationEnabled: boolean;
  currency: string;
  amountDue: number;
  /** When true, the amounts shown are a local estimate — the provider will calculate the final amount. */
  isEstimate?: boolean;
  /** When true, the target plan is cheaper than the current plan. */
  isDowngrade?: boolean;
  /** When true, the provider can't do an immediate downgrade — it will be scheduled at cycle end. */
  downgradeScheduledAtCycleEnd?: boolean;
  nextPaymentAttempt?: number | null;
  lineItems: ProrationLineItem[];
  currentPlan: { id: string; name: string; priceCents: number };
  targetPlan: { id: string; name: string; priceCents: number };
  currentPeriodEnd: string | null;
};
type CheckoutOverrides = {
  skipProrationCheck?: boolean;
  prorationFallbackReason?: string;
};

const AUTH_FLOW_FLAG = 'pricing-card-auth-flow';

function applyProrationFallback(
  ref: React.MutableRefObject<CheckoutOverrides | null>,
  reason: unknown,
): void {
  const fallbackReason = typeof reason === 'string' ? reason.slice(0, 100) : undefined;
  ref.current = {
    skipProrationCheck: true,
    prorationFallbackReason: fallbackReason && fallbackReason.length > 0 ? fallbackReason : undefined,
  };
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function PersistentModalPortal({ open, mounted, children }: { open: boolean; mounted: boolean; children: React.ReactNode }) {
  if (!mounted && !open) {
    return null;
  }

  return <ModalPortal>{children}</ModalPortal>;
}

type PricingModalKey = 'extend' | 'replace' | 'recurringTopup' | 'planSwitch' | 'planSwitchConfirm' | 'coupon' | 'auth' | 'proration';

function hasPendingProviderConfirmation(payload: unknown): boolean {
  const record = asRecord(payload);
  const pending = asRecord(record?.pending);
  return pending?.pendingConfirmation === true;
}

function getPendingProviderConfirmationPlanName(payload: unknown): string | null {
  const record = asRecord(payload);
  const pending = asRecord(record?.pending);
  return typeof pending?.plan === 'string' ? pending.plan : null;
}

type OwnedActiveSubscriptionSummary = {
  family: 'personal' | 'team';
  planId: string;
  plan: string;
  planAutoRenew: boolean;
  planSupportsOrganizations: boolean;
  expiresAt: string | null;
};

function getActiveWorkspaceFamily(payload: unknown): 'personal' | 'team' {
  const record = asRecord(payload);
  if (record?.source === 'organization') {
    return 'team';
  }

  return 'personal';
}

function getOwnedActiveSubscriptions(payload: unknown): OwnedActiveSubscriptionSummary[] {
  const record = asRecord(payload);
  const list = Array.isArray(record?.ownedActiveSubscriptions) ? record.ownedActiveSubscriptions : [];
  const parsed = list
    .map((item) => {
      const value = asRecord(item);
      if (!value) return null;
      const family = value.family === 'team' ? 'team' : value.family === 'personal' ? 'personal' : null;
      if (!family) return null;

      return {
        family,
        planId: typeof value.planId === 'string' ? value.planId : '',
        plan: typeof value.plan === 'string' ? value.plan : '',
        planAutoRenew: value.planAutoRenew === true,
        planSupportsOrganizations: value.planSupportsOrganizations === true,
        expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
      } satisfies OwnedActiveSubscriptionSummary;
    })
    .filter((item): item is OwnedActiveSubscriptionSummary => item !== null && item.planId.length > 0);

  if (parsed.length > 0) {
    return parsed;
  }

  if (record?.active !== true) {
    return [];
  }

  const fallbackPlanId = typeof record?.planId === 'string' ? record.planId : '';
  if (!fallbackPlanId) {
    return [];
  }

  return [{
    family: getPricingPlanFamily(record?.planSupportsOrganizations === true),
    planId: fallbackPlanId,
    plan: typeof record?.plan === 'string' ? record.plan : '',
    planAutoRenew: record?.planAutoRenew === true,
    planSupportsOrganizations: record?.planSupportsOrganizations === true,
    expiresAt: typeof record?.expiresAt === 'string' ? record.expiresAt : null,
  }];
}

export default function PricingCard({ plan, activeRecurringPlansByFamily = createEmptyActiveRecurringPlansByFamily(), scheduledPlanIdsByFamily = createEmptyScheduledPlanIdsByFamily(), currency, activeOrganizationId = null, teamPlanPurchaseDisabled = false, teamPlanPurchaseDisabledMessage, personalPlanPurchaseDisabled = false, personalPlanPurchaseDisabledMessage, demoReadOnlyMode = false }: { plan: DBPlan; activeRecurringPlansByFamily?: ActiveRecurringPlansByFamily; scheduledPlanIdsByFamily?: ScheduledPlanIdsByFamily; currency: string; activeOrganizationId?: string | null; teamPlanPurchaseDisabled?: boolean; teamPlanPurchaseDisabledMessage?: string; personalPlanPurchaseDisabled?: boolean; personalPlanPurchaseDisabledMessage?: string; demoReadOnlyMode?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [showRecurringTopupModal, setShowRecurringTopupModal] = useState(false);
  const [showPlanSwitchModal, setShowPlanSwitchModal] = useState(false);
  const [showPlanSwitchConfirmModal, setShowPlanSwitchConfirmModal] = useState(false);
  const [extendVisible, setExtendVisible] = useState(false);
  const [replaceVisible, setReplaceVisible] = useState(false);
  const [recurringTopupVisible, setRecurringTopupVisible] = useState(false);
  const [planSwitchVisible, setPlanSwitchVisible] = useState(false);
  const [planSwitchConfirmVisible, setPlanSwitchConfirmVisible] = useState(false);
  const [planSwitchConfirmChoice, setPlanSwitchConfirmChoice] = useState<'now' | 'cycle_end' | null>(null);
  const [planSwitchSupportsProration, setPlanSwitchSupportsProration] = useState<boolean | null>(null);
  const [planSwitchProviderKey, setPlanSwitchProviderKey] = useState<string | null>(null);
  const [planSwitchCapabilityLoading, setPlanSwitchCapabilityLoading] = useState(false);
  const [planSwitchProrationPending, setPlanSwitchProrationPending] = useState(false);
  const [existingExpiresAt, setExistingExpiresAt] = useState<string | null>(null);
  const [existingPlanName, setExistingPlanName] = useState<string | null>(null);
  const [recurringPlanName, setRecurringPlanName] = useState<string | null>(null);
  const [recurringRenewsAt, setRecurringRenewsAt] = useState<string | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const couponsCache = useRef<CouponOption[] | null>(null);
  const [couponOptions, setCouponOptions] = useState<CouponOption[]>([]);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponVisible, setCouponVisible] = useState(false);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [loadingCoupons, setLoadingCoupons] = useState(false);

  // Helper to display coupon discount label with proper currency
  function couponDiscountLabel(option: CouponOption): string {
    if (option.percentOff !== null) {
      return `${option.percentOff}% off`;
    }
    if (option.amountOffCents !== null) {
      return `-${formatPrice(option.amountOffCents, currency)}`;
    }
    return 'Discount';
  }
  const [couponError, setCouponError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authView, setAuthView] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authReturnPath, setAuthReturnPath] = useState('/pricing');
  const [mountedModals, setMountedModals] = useState<Record<PricingModalKey, boolean>>({
    extend: false,
    replace: false,
    recurringTopup: false,
    planSwitch: false,
    planSwitchConfirm: false,
    coupon: false,
    auth: false,
    proration: false,
  });
  const [showProrationModal, setShowProrationModal] = useState(false);
  const [prorationVisible, setProrationVisible] = useState(false);
  const [prorationLoading, setProrationLoading] = useState(false);
  const [prorationConfirming, setProrationConfirming] = useState(false);
  const [prorationError, setProrationError] = useState<string | null>(null);
  const [prorationPreview, setProrationPreview] = useState<ProrationPreview | null>(null);
  const [pendingProviderConfirmation, setPendingProviderConfirmation] = useState(false);
  const [pendingProviderConfirmationPlanName, setPendingProviderConfirmationPlanName] = useState<string | null>(null);
  const checkoutOverridesRef = useRef<CheckoutOverrides | null>(null);
  const { isSignedIn } = useAuthUser();
  const wasSignedInRef = useRef(isSignedIn);
  const authFlowActiveRef = useRef(false);
  const mountedRef = useRef(false);
  const [oneTimeRenewalResetsTokens, setOneTimeRenewalResetsTokens] = useState<boolean>(false);
  const [recurringRenewalResetsTokens, setRecurringRenewalResetsTokens] = useState<boolean>(false);

  const markModalMounted = useCallback((key: PricingModalKey) => {
    setMountedModals((current) => (current[key] ? current : { ...current, [key]: true }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setIfMounted = useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (value: React.SetStateAction<T>) => {
      if (mountedRef.current) setter(value);
    };
  }, []);

  const loadOneTimeRenewalTokenPolicy = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/settings/tokens');
      if (!res.ok) throw new Error('Failed');
      const j: unknown = await res.json();
      const r = asRecord(j);
      const oneTimeValue = r?.oneTimeRenewalResetsTokens === true;
      const recurringValue = r?.recurringRenewalResetsTokens === true;
      setIfMounted(setOneTimeRenewalResetsTokens)(oneTimeValue);
      setIfMounted(setRecurringRenewalResetsTokens)(recurringValue);
      return oneTimeValue;
    } catch {
      setIfMounted(setOneTimeRenewalResetsTokens)(false);
      setIfMounted(setRecurringRenewalResetsTokens)(false);
      return false;
    }
  }, [setIfMounted]);

  function determineReturnPath(): string {
    if (typeof window === 'undefined') {
      return '/pricing';
    }
    const candidate = `${window.location.pathname}${window.location.search}` || '/pricing';
    return candidate.startsWith('/') ? candidate : '/pricing';
  }

  const closeAuthModal = useCallback((): void => {
    authFlowActiveRef.current = false;
    setShowAuthModal(false);
    setAuthModalVisible(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_FLOW_FLAG);
    }
  }, []);

  async function checkout(options?: { couponCode?: string }) {
    start(() => {
      const params = new URLSearchParams();
      params.set('planId', plan.id);
      if (activeOrganizationId) {
        params.set('activeOrganizationId', activeOrganizationId);
      }
      if (options?.couponCode) {
        params.set('couponCode', options.couponCode);
      }

      const overrides = checkoutOverridesRef.current;
      if (overrides?.skipProrationCheck) {
        params.set('skipProrationCheck', 'true');
        if (overrides.prorationFallbackReason) {
          params.set('prorationFallbackReason', overrides.prorationFallbackReason);
        }
      }

      router.push(`/checkout/embedded?${params.toString()}`);
      return undefined;
    });
  }

  async function fetchAvailableCoupons(): Promise<CouponOption[]> {
    if (couponsCache.current) return couponsCache.current;
    setIfMounted(setLoadingCoupons)(true);
    setIfMounted(setCouponError)(null);
    try {
      const res = await fetch('/api/dashboard/coupons');
      const json = await res.json().catch(() => null) as unknown;
      if (!res.ok) {
        const obj = asRecord(json);
        const message = typeof obj?.error === 'string' ? obj.error : 'Failed to load coupons';
        setIfMounted(setCouponError)(message);
        showToast(message, 'error');
        couponsCache.current = [];
        return [];
      }
      const obj = asRecord(json);
      const list = Array.isArray(obj?.coupons) ? obj.coupons as unknown[] : [];
      type CouponApiRow = CouponOption & { consumedAt?: string | null; currentlyActive?: boolean };
      const parsed = list
        .map((item) => {
          const rec = asRecord(item) || {};
          const row: CouponApiRow = {
            id: typeof rec.id === 'string' ? rec.id : String(rec.id ?? ''),
            code: typeof rec.code === 'string' ? rec.code : '',
            description: typeof rec.description === 'string' ? rec.description : null,
            percentOff: typeof rec.percentOff === 'number' ? rec.percentOff : null,
            amountOffCents: typeof rec.amountOffCents === 'number' ? rec.amountOffCents : null,
            consumedAt: typeof rec.consumedAt === 'string' ? rec.consumedAt : null,
            currentlyActive: rec.currentlyActive !== false,
          };
          return row;
        })
        .filter((row) => row.code);
      const usable = parsed
        .filter((row) => row.currentlyActive !== false && !row.consumedAt)
        .map((row) => ({
          id: row.id,
          code: row.code,
          description: row.description,
          percentOff: row.percentOff,
          amountOffCents: row.amountOffCents,
        } as CouponOption));
      couponsCache.current = usable;
      return usable;
    } catch (error) {
      console.error('Failed to fetch coupons', error);
      setIfMounted(setCouponError)('Unable to load coupons right now.');
      return [];
    } finally {
      setIfMounted(setLoadingCoupons)(false);
    }
  }

  async function beginCheckoutFlow() {
    if (demoReadOnlyMode) {
      showToast('Demo mode is read-only. Payments and checkout are disabled in this environment.', 'info');
      return;
    }

    const coupons = await fetchAvailableCoupons();
    if (coupons.length === 0) {
      checkout();
      return;
    }
    setIfMounted(setCouponOptions)(coupons);
    setIfMounted(setSelectedCouponId)(coupons[0]?.id ?? null);
    markModalMounted('coupon');
    setIfMounted(setShowCouponModal)(true);
  }

  // Animate extend modal visibility to avoid flash on mount
  useEffect(() => {
    let raf = 0;
    if (showExtendModal) {
      setExtendVisible(false);
      raf = requestAnimationFrame(() => setExtendVisible(true));
    } else {
      setExtendVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showExtendModal]);

  // Animate replace modal visibility to avoid flash on mount
  useEffect(() => {
    let raf = 0;
    if (showReplaceModal) {
      setReplaceVisible(false);
      raf = requestAnimationFrame(() => setReplaceVisible(true));
    } else {
      setReplaceVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showReplaceModal]);

  useEffect(() => {
    let raf = 0;
    if (showRecurringTopupModal) {
      setRecurringTopupVisible(false);
      raf = requestAnimationFrame(() => setRecurringTopupVisible(true));
    } else {
      setRecurringTopupVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showRecurringTopupModal]);

  useEffect(() => {
    let raf = 0;
    if (showPlanSwitchModal) {
      setPlanSwitchVisible(false);
      raf = requestAnimationFrame(() => setPlanSwitchVisible(true));
    } else {
      setPlanSwitchVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showPlanSwitchModal]);

  useEffect(() => {
    let raf = 0;
    if (showPlanSwitchConfirmModal) {
      setPlanSwitchConfirmVisible(false);
      raf = requestAnimationFrame(() => setPlanSwitchConfirmVisible(true));
    } else {
      setPlanSwitchConfirmVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showPlanSwitchConfirmModal]);

  useEffect(() => {
    if (!showPlanSwitchModal) return;
    let mounted = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    const probe = async () => {
      setPlanSwitchCapabilityLoading(true);
      setPlanSwitchSupportsProration(null);
      setPlanSwitchProviderKey(null);
      setPlanSwitchProrationPending(false);
      try {
        const res = await fetch(`/api/subscription/proration?planId=${encodeURIComponent(plan.id)}`,
          controller ? { signal: controller.signal } : undefined,
        );
        const json = await res.json().catch(() => null) as unknown;
        const obj = asRecord(json);

        // Previous switch still processing
        if (res.status === 409 && obj?.prorationPending === true) {
          if (mounted) {
            setPlanSwitchProrationPending(true);
            setPlanSwitchSupportsProration(false);
          }
          return;
        }

        // Full proration preview available
        const hasProration = Boolean(res.ok && obj?.prorationEnabled === true);
        // Provider supports inline update but can't show a proration preview
        const hasInlineSwitch = Boolean(res.ok && obj?.supportsInlineSwitch === true);
        const providerKey = typeof obj?.providerKey === 'string' ? obj.providerKey : null;
        if (mounted) {
          setPlanSwitchSupportsProration(hasProration || hasInlineSwitch);
          setPlanSwitchProviderKey(providerKey);
        }
      } catch {
        if (mounted) {
          setPlanSwitchSupportsProration(false);
          setPlanSwitchProviderKey(null);
        }
      } finally {
        if (mounted) {
          setPlanSwitchCapabilityLoading(false);
        }
      }
    };

    void probe();
    return () => {
      mounted = false;
      if (controller) controller.abort();
    };
  }, [showPlanSwitchModal, plan.id]);

  // Animate coupon modal visibility to avoid flash on mount
  useEffect(() => {
    let raf = 0;
    if (showCouponModal) {
      setCouponVisible(false);
      raf = requestAnimationFrame(() => setCouponVisible(true));
    } else {
      setCouponVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showCouponModal]);

  // Animate proration modal visibility to avoid flash on mount
  useEffect(() => {
    let raf = 0;
    if (showProrationModal) {
      setProrationVisible(false);
      raf = requestAnimationFrame(() => setProrationVisible(true));
    } else {
      setProrationVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showProrationModal]);

  useEffect(() => {
    let raf = 0;
    if (showAuthModal) {
      setAuthModalVisible(false);
      raf = requestAnimationFrame(() => setAuthModalVisible(true));
    } else {
      setAuthModalVisible(false);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [showAuthModal]);

  useEffect(() => {
    const hasPendingFlag = typeof window !== 'undefined' ? sessionStorage.getItem(AUTH_FLOW_FLAG) : null;
    const shouldNotify =
      isSignedIn &&
      (!wasSignedInRef.current && authFlowActiveRef.current || Boolean(hasPendingFlag));

    if (shouldNotify) {
      showToast('Signed in successfully. Redirecting…', 'success');
      closeAuthModal();
      authFlowActiveRef.current = false;
      if (hasPendingFlag && typeof window !== 'undefined') {
        sessionStorage.removeItem(AUTH_FLOW_FLAG);
      }
    }
    wasSignedInRef.current = isSignedIn;
  }, [isSignedIn, closeAuthModal]);

  useEffect(() => {
    let active = true;

    const syncPendingProviderConfirmation = async () => {
      try {
        const res = await fetch('/api/subscription');
        const payload = await res.json().catch(() => null);
        if (!active || !res.ok) return;
        const hasPending = hasPendingProviderConfirmation(payload);
        setIfMounted(setPendingProviderConfirmation)(hasPending);
        setIfMounted(setPendingProviderConfirmationPlanName)(
          hasPending ? getPendingProviderConfirmationPlanName(payload) : null,
        );
      } catch {
        if (!active) return;
        setIfMounted(setPendingProviderConfirmation)(false);
        setIfMounted(setPendingProviderConfirmationPlanName)(null);
      }
    };

    void syncPendingProviderConfirmation();

    const handleUpdated = () => {
      void syncPendingProviderConfirmation();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('subscription:updated', handleUpdated as EventListener);
    }

    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('subscription:updated', handleUpdated as EventListener);
      }
    };
  }, [setIfMounted]);

  function confirmCouponSelection(apply: boolean) {
    const chosen = apply ? couponOptions.find((item) => item.id === selectedCouponId) : undefined;
    if (apply && !chosen) {
      showToast('Select a coupon or skip applying it.', 'error');
      return;
    }
    setShowCouponModal(false);
    checkout(chosen ? { couponCode: chosen.code } : undefined);
  }

  function formatCurrency(amountCents: number, currency: string): string {
    const value = (amountCents ?? 0) / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
    } catch {
      // Fallback using our currency utility for proper symbol
      return formatCurrencyUtil(amountCents, currency);
    }
  }

  async function openProrationFlow() {
    setIfMounted(setProrationError)(null);
    setIfMounted(setProrationPreview)(null);
    setIfMounted(setProrationLoading)(true);
    checkoutOverridesRef.current = null;
    try {
      const res = await fetch(`/api/subscription/proration?planId=${plan.id}`);
      const json = await res.json().catch(() => null) as unknown;
      if (!res.ok) {
        const obj = asRecord(json);
        // Previous proration switch is still being processed (invoice not yet captured).
        if (res.status === 409 && obj?.prorationPending === true) {
          const message = typeof obj?.message === 'string'
            ? obj.message
            : 'Your previous plan change is still being processed. Please wait a moment.';
          setIfMounted(setProrationError)(message);
          showToast(message, 'info');
          return;
        }
        if (res.status === 409 && obj?.prorationEnabled === false) {
          applyProrationFallback(checkoutOverridesRef, obj?.reason ?? 'PRORATION_FALLBACK');
          await beginCheckoutFlow();
          return;
        }
        const message = typeof obj?.error === 'string' ? obj.error : 'Unable to build proration preview.';
        setIfMounted(setProrationError)(message);
        showToast(message, 'error');
        return;
      }
      const obj = asRecord(json);

      // Provider supports inline switch but not a proration preview.
      // Skip the preview modal and go straight to confirmation.
      if (obj?.supportsInlineSwitch === true && obj?.prorationEnabled !== true) {
        setIfMounted(setProrationLoading)(false);
        await confirmProration();
        return;
      }

      if (!obj || obj.prorationEnabled !== true) {
        applyProrationFallback(checkoutOverridesRef, obj?.reason ?? 'PRORATION_DISABLED');
        await beginCheckoutFlow();
        return;
      }
      const currentPlanRec = (asRecord(obj.currentPlan) ?? {}) as Record<string, unknown>;
      const targetPlanRec = (asRecord(obj.targetPlan) ?? {}) as Record<string, unknown>;

      const preview: ProrationPreview = {
        prorationEnabled: true,
        currency: typeof obj.currency === 'string' ? obj.currency : 'usd',
        amountDue: typeof obj.amountDue === 'number' ? obj.amountDue : 0,
        isEstimate: obj.isEstimate === true,
        isDowngrade: obj.isDowngrade === true,
        downgradeScheduledAtCycleEnd: obj.downgradeScheduledAtCycleEnd === true,
        nextPaymentAttempt: typeof obj.nextPaymentAttempt === 'number' ? obj.nextPaymentAttempt : null,
        lineItems: Array.isArray(obj.lineItems)
          ? obj.lineItems.map((item) => {
            const rec = asRecord(item) || {};
            return {
              id: typeof rec.id === 'string' ? rec.id : null,
              description: typeof rec.description === 'string' ? rec.description : null,
              amount: typeof rec.amount === 'number' ? rec.amount : 0,
              proration: rec.proration === true,
            } satisfies ProrationLineItem;
          })
          : [],
        currentPlan: {
          id: typeof currentPlanRec['id'] === 'string' ? (currentPlanRec['id'] as string) : plan.id,
          name: typeof currentPlanRec['name'] === 'string' ? (currentPlanRec['name'] as string) : plan.name,
          priceCents: typeof currentPlanRec['priceCents'] === 'number' ? (currentPlanRec['priceCents'] as number) : plan.priceCents,
        },
        targetPlan: {
          id: typeof targetPlanRec['id'] === 'string' ? (targetPlanRec['id'] as string) : plan.id,
          name: typeof targetPlanRec['name'] === 'string' ? (targetPlanRec['name'] as string) : plan.name,
          priceCents: typeof targetPlanRec['priceCents'] === 'number' ? (targetPlanRec['priceCents'] as number) : plan.priceCents,
        },
        currentPeriodEnd: typeof obj.currentPeriodEnd === 'string' ? obj.currentPeriodEnd : null,
      };
      setIfMounted(setProrationPreview)(preview);
      markModalMounted('proration');
      setIfMounted(setShowProrationModal)(true);
    } catch (error) {
      console.error('Failed to load proration preview', error);
      const message = 'Unable to calculate proration right now.';
      setIfMounted(setProrationError)(message);
      showToast(message, 'error');
    } finally {
      setIfMounted(setProrationLoading)(false);
    }
  }

  function closeProrationModal() {
    setShowProrationModal(false);
    setProrationPreview(null);
    setProrationError(null);
  }

  async function confirmProration() {
    if (prorationConfirming) return;
    setIfMounted(setProrationConfirming)(true);
    setIfMounted(setProrationError)(null);
    try {
      const postBody: Record<string, unknown> = { planId: plan.id };
      // When the proration preview indicated the switch should be
      // scheduled at cycle end, signal the backend accordingly.
      if (prorationPreview?.downgradeScheduledAtCycleEnd) {
        postBody.downgradeScheduledAtCycleEnd = true;
      }
      const res = await fetch('/api/subscription/proration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });
      const json = await res.json().catch(() => null) as unknown;
      if (!res.ok) {
        const obj = asRecord(json);
        const message = typeof obj?.error === 'string' ? obj.error : 'Failed to update subscription.';
        setIfMounted(setProrationError)(message);
        showToast(message, 'error');
        return;
      }

      const result = asRecord(json);

      // The plan change was scheduled at cycle end (user explicitly chose
      // "Switch at end of cycle").
      if (result?.scheduled === true) {
        const newPlanName = typeof result?.newPlan === 'object' && result.newPlan
          ? (asRecord(result.newPlan)?.name as string) : plan.name;
        const periodEnd = typeof result?.currentPeriodEnd === 'string'
          ? new Date(result.currentPeriodEnd).toLocaleDateString() : null;
        const msg = periodEnd
          ? `Your plan will switch to ${newPlanName} at the end of your current billing period (${periodEnd}).`
          : `Your plan will switch to ${newPlanName} at the end of your current billing period.`;
        showToast(msg, 'success');
        closeProrationModal();
        router.refresh();
        return;
      }

      // Stripe SCA / 3D Secure: payment requires additional customer authentication.
      if (result?.requiresAction === true && typeof result?.clientSecret === 'string') {
        try {
          const { loadStripe } = await import('@stripe/stripe-js');
          const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
          if (!stripeKey) throw new Error('Stripe public key not configured');
          const stripe = await loadStripe(stripeKey);
          if (!stripe) throw new Error('Failed to load Stripe');

          const { error: scaError, paymentIntent } = await stripe.confirmCardPayment(result.clientSecret as string);
          if (scaError) {
            const scaMessage = scaError.message || 'Payment authentication failed.';
            setIfMounted(setProrationError)(scaMessage);
            showToast(scaMessage, 'error');
            return;
          }
          if (paymentIntent?.status === 'succeeded') {
            const newPlanName = typeof result?.newPlan === 'object' && result.newPlan
              ? (asRecord(result.newPlan)?.name as string) : plan.name;
            showToast(`Subscription upgraded to ${newPlanName} successfully.`, 'success');
            closeProrationModal();
            router.refresh();
            return;
          }
        } catch (scaErr) {
          console.error('SCA confirmation failed', scaErr);
          const scaMessage = 'Payment authentication could not be completed. Your plan was updated but payment is pending.';
          showToast(scaMessage, 'error');
          closeProrationModal();
          router.refresh();
          return;
        }
      }

      // Extract actual amount charged for better user feedback
      const pendingConfirmation = result?.pendingConfirmation === true;
      const actualAmountCharged = typeof result?.actualAmountCharged === 'number' ? result.actualAmountCharged : null;
      const newPlanName = typeof result?.newPlan === 'object' && result.newPlan ?
        (asRecord(result.newPlan)?.name as string) : plan.name;

      if (pendingConfirmation) {
        setPlanSwitchProrationPending(true);
      }

      const prorationFeedback = buildProrationSuccessMessage({
        pendingConfirmation,
        actualAmountCharged,
        newPlanName,
        formatPrice: (amountCents) => formatPrice(amountCents, currency),
      });

      showToast(prorationFeedback.message, prorationFeedback.tone);
      closeProrationModal();
      router.refresh();
    } catch (error) {
      console.error('Proration confirmation failed', error);
      const message = 'Failed to update subscription.';
      setIfMounted(setProrationError)(message);
      showToast(message, 'error');
    } finally {
      setIfMounted(setProrationConfirming)(false);
    }
  }

  function openPlanSwitchConfirm(choice: 'now' | 'cycle_end') {
    setPlanSwitchConfirmChoice(choice);
    setShowPlanSwitchModal(false);
    markModalMounted('planSwitchConfirm');
    setShowPlanSwitchConfirmModal(true);
  }

  function backToPlanSwitchTiming() {
    setShowPlanSwitchConfirmModal(false);
    markModalMounted('planSwitch');
    setShowPlanSwitchModal(true);
  }

  function closePlanSwitchConfirm() {
    setShowPlanSwitchConfirmModal(false);
    setPlanSwitchConfirmChoice(null);
  }

  function executePlanSwitchConfirm() {
    if (!planSwitchConfirmChoice) return;
    const choice = planSwitchConfirmChoice;
    setShowPlanSwitchConfirmModal(false);

    if (choice === 'now') {
      if (planSwitchSupportsProration) {
        void openProrationFlow();
        return;
      }

      applyProrationFallback(checkoutOverridesRef, 'PROVIDER_PRORATION_UNSUPPORTED');
      showToast('Complete checkout, then activate to switch immediately.', 'success');
      void beginCheckoutFlow();
      return;
    }

    // choice === 'cycle_end'
    start(() => {
      void (async () => {
        try {
          const res = await fetch('/api/subscription/proration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: plan.id, scheduleAt: 'cycle_end' }),
          });

          const json = await res.json().catch(() => null) as unknown;
          const obj = asRecord(json);
          if (res.ok && obj?.ok === true && obj?.scheduled === true) {
            showToast('Plan will switch at the end of your current cycle.', 'success');
            router.refresh();
            return;
          }

          // Some providers (e.g. Paystack pay-at-renewal) may require a reusable
          // payment authorization on file. In that case, prompt user action rather
          // than falling back to immediate-charge checkout.
          const code = typeof obj?.code === 'string' ? obj.code : '';
          if (code === 'PAYSTACK_AUTHORIZATION_REQUIRED') {
            try {
              const portalRes = await fetch('/api/billing/customer-portal', { method: 'POST' });
              const portalJson = await portalRes.json().catch(() => null) as unknown;
              const portalObj = asRecord(portalJson);
              const url = typeof portalObj?.url === 'string' ? portalObj.url : '';
              const supported = portalObj?.supported === true;
              const message = typeof portalObj?.message === 'string' ? portalObj.message : '';

              if (portalRes.ok && supported && url) {
                window.open(url, '_blank', 'noopener,noreferrer');
                showToast('Opened billing portal to update your payment method. Retry scheduling after updating.', 'info');
              } else {
                showToast(
                  message || 'Unable to open billing portal. Please contact support.',
                  'error'
                );
              }
            } catch {
              showToast('Unable to open billing portal. Please contact support.', 'error');
            }
            return;
          }
          if (code === 'PAYSTACK_CUSTOMER_MISSING') {
            showToast('Billing customer details are missing. Please contact support.', 'error');
            return;
          }

          const fallbackCodes = new Set([
            'PROVIDER_SCHEDULED_PLAN_CHANGE_UNSUPPORTED',
            'PRORATION_DISABLED',
          ]);
          if (fallbackCodes.has(code)) {
            applyProrationFallback(checkoutOverridesRef, 'SWITCH_AT_PERIOD_END');
            showToast('Plan will be queued for your renewal (you can activate early anytime).', 'info');
            void beginCheckoutFlow();
            return;
          }

          const serverError = typeof obj?.error === 'string' && obj.error.trim().length > 0
            ? obj.error
            : 'Unable to schedule your plan switch right now. Please try again.';
          showToast(serverError, 'error');
        } catch {
          showToast('Unable to schedule your plan switch right now. Please try again.', 'error');
        }
      })();
      return undefined;
    });
  }

  // Called when user clicks Buy. Handles different scenarios based on existing subscription.
  // Scenario 1: Non-recurring active + buying recurring → show warning that recurring replaces existing
  // Scenario 2: Recurring active + buying non-recurring → add tokens, no expiry extension
  // Scenario 3: Non-recurring active + buying non-recurring → extend time + add tokens
  async function onBuyClick() {
    if (purchaseBlocked) {
      showToast(purchaseBlockedMessage, 'info');
      return;
    }

    if (isCurrentAutoRenewPlan) {
      showToast('You are already on this subscription.', 'info');
      return;
    }

    try {
      setIfMounted(setCheckingExisting)(true);
      const res = await fetch('/api/subscription');
      const json = await res.json().catch(() => null) as unknown;
      const sub = asRecord(json);

      if (res.status === 401 || res.status === 403) {
        setIfMounted(setAuthReturnPath)(determineReturnPath());
        setIfMounted(setAuthView)('sign-in');
        authFlowActiveRef.current = true;
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(AUTH_FLOW_FLAG, '1');
          } catch (error) {
            console.warn('Unable to persist auth flow flag', error);
          }
        }
        markModalMounted('auth');
        setIfMounted(setShowAuthModal)(true);
        setIfMounted(setCheckingExisting)(false);
        return;
      }

      if (res.ok && hasPendingProviderConfirmation(sub)) {
        setIfMounted(setPendingProviderConfirmation)(true);
        setIfMounted(setPendingProviderConfirmationPlanName)(getPendingProviderConfirmationPlanName(sub));
        showToast('A plan change is already awaiting Paystack payment confirmation. Please wait for confirmation before starting another subscription change.', 'info');
        setIfMounted(setCheckingExisting)(false);
        return;
      }

      const ownedActiveSubscriptions = getOwnedActiveSubscriptions(sub);
      const activeWorkspaceFamily = getActiveWorkspaceFamily(sub);
      const memberLockedWorkspace = isMemberLockedTeamWorkspace(sub);
      const matchingOwnedSubscription = ownedActiveSubscriptions.find((subscription) => subscription.family === planFamily) ?? null;
      const hasAnyOwnedTeamRecurring = ownedActiveSubscriptions.some((subscription) => subscription.planAutoRenew && subscription.planSupportsOrganizations);

      if (isTeamPlan && memberLockedWorkspace) {
        showToast('Only the workspace owner can purchase or change team plans for this workspace.', 'info');
        setIfMounted(setCheckingExisting)(false);
        return;
      }

      // Check if user has an active subscription
      if (res.ok && matchingOwnedSubscription) {
        const hasRecurring = matchingOwnedSubscription.planAutoRenew === true;
        const hasTeamRecurringInCurrentWorkspace = activeWorkspaceFamily === 'team' && hasAnyOwnedTeamRecurring;
        const buyingRecurring = plan.autoRenew;

        if (hasTeamRecurringInCurrentWorkspace && !buyingRecurring && !isTeamPlan) {
          showToast('Personal one-time top-ups are blocked while your Team subscription is active. Buy a Team top-up from workspace billing.', 'info');
          setIfMounted(setCheckingExisting)(false);
          return;
        }

        // Scenario 1: Active non-recurring + purchasing recurring
        // Show modal warning that recurring will replace existing access
        if (!hasRecurring && buyingRecurring) {
          setIfMounted(setExistingExpiresAt)(matchingOwnedSubscription.expiresAt);
          setIfMounted(setExistingPlanName)(matchingOwnedSubscription.plan);
          markModalMounted('replace');
          setIfMounted(setShowReplaceModal)(true);
          setIfMounted(setCheckingExisting)(false);
          return;
        }

        // Scenario 2: Active recurring + purchasing non-recurring
        // Tokens are added without extending expiry (handled by backend)
        // Show info modal but proceed
        if (hasRecurring && !buyingRecurring) {
          setIfMounted(setRecurringPlanName)(matchingOwnedSubscription.plan);
          setIfMounted(setRecurringRenewsAt)(matchingOwnedSubscription.expiresAt);
          markModalMounted('recurringTopup');
          setIfMounted(setShowRecurringTopupModal)(true);
          setIfMounted(setCheckingExisting)(false);
          return;
        }

        // Scenario 3: Active non-recurring + purchasing non-recurring
        // Extend time + add tokens
        if (!hasRecurring && !buyingRecurring) {
          setIfMounted(setExistingExpiresAt)(matchingOwnedSubscription.expiresAt);
          setIfMounted(setExistingPlanName)(matchingOwnedSubscription.plan);
          await loadOneTimeRenewalTokenPolicy();
          markModalMounted('extend');
          setIfMounted(setShowExtendModal)(true);
          setIfMounted(setCheckingExisting)(false);
          return;
        }

        // Scenario 4: Active recurring + purchasing recurring
        await loadOneTimeRenewalTokenPolicy();
        setIfMounted(setCheckingExisting)(false);
        setIfMounted(setRecurringPlanName)(matchingOwnedSubscription.plan);
        setIfMounted(setRecurringRenewsAt)(matchingOwnedSubscription.expiresAt);
        markModalMounted('planSwitch');
        setIfMounted(setShowPlanSwitchModal)(true);
        return;
      }
    } catch (e) {
      // Ignore errors and fall back to normal checkout
      console.error('Error checking existing subscription', e);
    } finally {
      setIfMounted(setCheckingExisting)(false);
    }

    // No active subscription or error -> proceed normally
    await beginCheckoutFlow();
  }

  const intervalLabel = plan.recurringInterval
    ? plan.recurringInterval.replace(/_/g, ' ').toLowerCase()
    : 'billing period';
  const isLifetimePlan = plan.autoRenew !== true && plan.isLifetime === true;
  const durationDays = Number.isFinite(plan.durationHours) && plan.durationHours > 0
    ? Math.max(1, Math.round(plan.durationHours / 24))
    : null;
  const tokenLabel = plan.tokenName || 'tokens';
  const isTeamPlan = plan.supportsOrganizations === true;
  const isPersonalPlan = !isTeamPlan;
  const teamPurchaseBlocked = isTeamPlan && teamPlanPurchaseDisabled;
  const teamPurchaseBlockedMessage = teamPlanPurchaseDisabledMessage ?? 'Only the workspace owner can purchase or change team plans for this workspace.';
  const personalPurchaseBlocked = isPersonalPlan && personalPlanPurchaseDisabled;
  const personalPurchaseBlockedMessage = personalPlanPurchaseDisabledMessage ?? 'Personal plans can only be purchased from your personal workspace. Switch out of this organization workspace and try again.';
  const demoReadOnlyPurchaseBlockedMessage = 'Demo mode is read-only. Payments and checkout are disabled in this environment.';
  const purchaseBlocked = demoReadOnlyMode || teamPurchaseBlocked || personalPurchaseBlocked;
  const purchaseBlockedMessage = demoReadOnlyMode
    ? demoReadOnlyPurchaseBlockedMessage
    : teamPurchaseBlocked
      ? teamPurchaseBlockedMessage
      : personalPurchaseBlockedMessage;
  const purchaseBlockedTooltipId = purchaseBlocked ? `pricing-card-lock-${plan.id}` : undefined;
  const planFamily = getPricingPlanFamily(plan.supportsOrganizations);
  const normalizedSeatLimit = typeof plan.organizationSeatLimit === 'number' ? plan.organizationSeatLimit : null;
  const tokenPoolStrategyLabel = getTeamTokenPoolStrategyLabel(plan.organizationTokenPoolStrategy);
  const tokenAllowanceLabel = isTeamPlan
    ? getPlanTokenAllowanceLabel({
        tokenLimit: plan.tokenLimit,
        tokenName: tokenLabel,
        organizationTokenPoolStrategy: plan.organizationTokenPoolStrategy,
      })
    : plan.tokenLimit !== null && plan.tokenLimit !== undefined
      ? `${plan.tokenLimit.toLocaleString()} ${tokenLabel} included`
      : `Unlimited ${tokenLabel}`;
  const features = [
    plan.autoRenew
      ? { icon: faArrowRotateRight, label: `Auto-renews every ${intervalLabel}` }
      : { icon: faBolt, label: isLifetimePlan ? 'One-time payment' : 'No auto-renewal ' },
    plan.tokenLimit !== null && plan.tokenLimit !== undefined
      ? { icon: faCheck, label: tokenAllowanceLabel }
      : { icon: faInfinity, label: tokenAllowanceLabel },
    isLifetimePlan
      ? { icon: faInfinity, label: 'Lifetime access' }
      : durationDays
      ? { icon: faClock, label: `${durationDays} day${durationDays === 1 ? '' : 's'} of access` }
      : null,
    ...(isTeamPlan
      ? [
        {
          icon: faUsers,
          label: normalizedSeatLimit
            ? `Seats for up to ${normalizedSeatLimit.toLocaleString()} teammates`
            : 'Flexible seat limits you control',
        },
        {
          icon: faCoins,
          label: tokenPoolStrategyLabel,
        },
      ]
      : [
        {
          icon: faUser,
          label: 'Single-seat access',
        },
        {
          icon: faShield,
          label: 'Personal token pool',
        },
      ]),
  ].filter(Boolean) as { icon: IconDefinition; label: string }[];
  const priceFrequency = plan.autoRenew ? `per ${intervalLabel}` : isLifetimePlan ? 'lifetime' : 'one-off';
  const badge = plan.autoRenew
    ? {
      text: 'recurring',
      className:
        'border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-200'
    }
    : {
      text: isLifetimePlan ? 'lifetime' : 'one-time',
      className:
        'border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-300/40 dark:bg-amber-400/10 dark:text-amber-200'
    };
  const activeRecurringPlan = activeRecurringPlansByFamily[planFamily];
  const scheduledPlanId = scheduledPlanIdsByFamily[planFamily];
  const isCurrentAutoRenewPlan = Boolean(activeRecurringPlan && plan.autoRenew && activeRecurringPlan.planId === plan.id);
  const isScheduledPlan = Boolean(scheduledPlanId && plan.autoRenew && plan.id === scheduledPlanId);
  const isSwitchingAutoRenewPlan = Boolean(activeRecurringPlan && plan.autoRenew && !isCurrentAutoRenewPlan && !isScheduledPlan);
  const comparisonPriceCents = activeRecurringPlan?.priceCents ?? null;

  // Normalize prices to daily rates for fair cross-interval comparison
  // (e.g. $300/month vs $100/day → $10/day vs $100/day → the daily plan is an upgrade).
  const normalizeToDailyRate = (cents: number, interval: string | null) => {
    switch (interval) {
      case 'day':   return cents;
      case 'week':  return cents / 7;
      case 'month': return cents / 30;
      case 'year':  return cents / 365;
      default:      return cents;
    }
  };
  const planSwitchKind = (() => {
    if (!isSwitchingAutoRenewPlan || typeof comparisonPriceCents !== 'number') return 'change' as const;
    const currentDaily = normalizeToDailyRate(comparisonPriceCents, activeRecurringPlan?.recurringInterval ?? null);
    const targetDaily = normalizeToDailyRate(plan.priceCents, plan.recurringInterval ?? null);
    if (targetDaily > currentDaily) return 'upgrade' as const;
    if (targetDaily < currentDaily) return 'downgrade' as const;
    return 'change' as const;
  })();

  let buttonLabel: string;
  if (demoReadOnlyMode) {
    buttonLabel = 'Checkout disabled in demo';
  } else if (teamPurchaseBlocked) {
    buttonLabel = 'Workspace owner only';
  } else if (personalPurchaseBlocked) {
    buttonLabel = 'Personal workspace only';
  } else if (pending || checkingExisting || loadingCoupons || prorationLoading || prorationConfirming) {
    buttonLabel = 'Preparing checkout…';
  } else if (pendingProviderConfirmation) {
    buttonLabel = 'Awaiting payment confirmation';
  } else if (isCurrentAutoRenewPlan) {
    buttonLabel = 'Current plan active';
  } else if (isScheduledPlan) {
    buttonLabel = 'Scheduled at cycle end';
  } else if (isSwitchingAutoRenewPlan) {
    if (typeof comparisonPriceCents === 'number') {
      buttonLabel = plan.priceCents > comparisonPriceCents ? 'Upgrade plan' : plan.priceCents < comparisonPriceCents ? 'Downgrade plan' : 'Switch plan';
    } else {
      buttonLabel = 'Switch plan';
    }
  } else {
    if (isTeamPlan) {
      buttonLabel = plan.autoRenew ? 'Start team subscription' : 'Unlock team access';
    } else {
      buttonLabel = plan.autoRenew ? 'Subscribe now' : 'Buy now';
    }
  }

  const isButtonDisabled = purchaseBlocked || pending || checkingExisting || loadingCoupons || prorationLoading || prorationConfirming || pendingProviderConfirmation || isCurrentAutoRenewPlan || isScheduledPlan;

  return (
            <div className="theme-shadow-card group relative mx-auto flex h-full w-full max-w-[420px] flex-col overflow-hidden rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[linear-gradient(135deg,rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.84)),rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.84))),linear-gradient(135deg,var(--theme-card-gradient-from),var(--theme-card-gradient-via),var(--theme-card-gradient-to))] p-6 transition-transform duration-300 hover:-translate-y-1">
      <div className="relative flex flex-col gap-5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-6">
              <div className="flex flex-col gap-2">
              <span className={`inline-flex w-full items-center gap-2 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {badge.text}
              </span>

              {isTeamPlan ? (
                <span className="inline-flex w-full items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-100">
                  <FontAwesomeIcon icon={faUsers} className="h-2.5 w-2.5" />
                  Team
                </span>
              ) : (
                <span className="inline-flex w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                  <FontAwesomeIcon icon={faUser} className="h-2.5 w-2.5" />
                  Individual
                </span>
              )}
            </div>

            <div className="min-w-[120px] text-right">
              <div className="text-2xl font-semibold text-slate-900 dark:text-white">{formatPrice(plan.priceCents, currency)}</div>
              <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-neutral-300/80">{priceFrequency}</div>
            </div>
          </div>

          <h3 className="w-full text-xl font-semibold text-slate-900 dark:text-neutral-50">{plan.name}</h3>

          {plan.description ? (
            <div
              className="pricing-card-description text-sm leading-relaxed text-slate-600 dark:text-neutral-300"
              dangerouslySetInnerHTML={{ __html: plan.description }}
            />
          ) : null}
        </div>


          <div className="grid gap-3">
            {features.map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-2 shadow-sm transition-colors group-hover:border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))] group-hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.07))] dark:border-white/0 dark:bg-white/5 dark:shadow-none dark:group-hover:border-white/10 dark:group-hover:bg-white/[0.08]"
              >
                <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.20)),rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.10)),rgb(var(--bg-primary)))] text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] dark:bg-[linear-gradient(135deg,rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.30)),rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12)),transparent)] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.92))]">
                  <FontAwesomeIcon icon={feature.icon} className="h-4 w-4" />
                </span>
                <p className="text-xs text-slate-600 dark:text-neutral-200">{feature.label}</p>
              </div>
            ))}
          </div>


      </div>

      <div className="relative mt-auto flex flex-col gap-4 pt-6">
        <div className="group/cta relative w-full">
        <button
          disabled={isButtonDisabled}
          onClick={onBuyClick}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(90deg,rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95)),rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.78)),rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95)))] px-5 py-3 text-sm font-semibold text-white text-actual-white shadow-[0_20px_45px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.28))] transition hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.55))] disabled:cursor-not-allowed disabled:opacity-60"
          aria-disabled={isButtonDisabled}
          aria-label={purchaseBlocked ? purchaseBlockedMessage : buttonLabel}
          aria-describedby={purchaseBlockedTooltipId}
          title={pendingProviderConfirmation
            ? `Another plan change${pendingProviderConfirmationPlanName ? ` (${pendingProviderConfirmationPlanName})` : ''} is awaiting Paystack payment confirmation.`
            : purchaseBlocked
              ? undefined
            : isCurrentAutoRenewPlan
              ? `You are already subscribed to this ${isTeamPlan ? 'team' : 'personal'} plan.`
              : undefined}
        >
          {buttonLabel}
        </button>
        {purchaseBlocked ? (
          <div
            id={purchaseBlockedTooltipId}
            role="tooltip"
            className="pointer-events-none absolute bottom-[calc(100%+0.75rem)] left-1/2 z-20 w-[min(18rem,calc(100vw-3rem))] -translate-x-1/2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center text-xs leading-relaxed text-slate-50 [color:#f8fafc] opacity-0 shadow-xl transition-opacity duration-75 group-hover/cta:opacity-100 group-focus-within/cta:opacity-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:[color:#f8fafc]"
          >
            {purchaseBlockedMessage}
            <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-slate-800 bg-slate-950 dark:border-slate-700 dark:bg-slate-950" />
          </div>
        ) : null}
        </div>

        {pendingProviderConfirmation ? (
          <p className="text-center text-xs text-amber-700 dark:text-amber-200">
            Another plan change{pendingProviderConfirmationPlanName ? ` for ${pendingProviderConfirmationPlanName}` : ''} is awaiting Paystack confirmation.
          </p>
        ) : null}

        {/* Extend confirmation modal for one-time plans */}
        <PersistentModalPortal open={showExtendModal} mounted={mountedModals.extend}>
            <div aria-hidden={!showExtendModal} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${showExtendModal ? '' : 'pointer-events-none invisible'}`}>
              <div className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${extendVisible ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowExtendModal(false)} />
              <div className={`relative max-w-md w-full rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${extendVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.99]'}`}>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Extend existing access?</h3>
                <p className="mt-2 text-xs">
                  You currently have an active <strong>{existingPlanName || 'one-time'}</strong> plan{existingExpiresAt ? ` until ${new Date(existingExpiresAt).toLocaleString()}` : ''}.
                </p>
                <p className="mt-2 text-xs">
                  Purchasing <strong>{plan.name}</strong> will:
                </p>
                <ul className="ml-4 mt-1 list-disc space-y-1 text-xs">
                  <li>{isLifetimePlan ? 'Keep lifetime access active without an expiry date.' : `Extend your access by ${Math.floor(plan.durationHours / 24)} day${Math.floor(plan.durationHours / 24) !== 1 ? 's' : ''}`}</li>
                  {plan.tokenLimit && plan.tokenLimit > 0 && (
                    oneTimeRenewalResetsTokens
                      ? <li>Reset your {plan.tokenName || 'tokens'} balance to {plan.tokenLimit.toLocaleString()} {plan.tokenName || 'tokens'}</li>
                      : <li>Add {plan.tokenLimit.toLocaleString()} {plan.tokenName || 'tokens'} to your balance</li>
                  )}
                </ul>
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                    onClick={() => setShowExtendModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded bg-[color:rgb(var(--accent-primary))] px-3 py-1 text-sm text-white text-actual-white transition-colors hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.55))]"
                    disabled={demoReadOnlyMode}
                    onClick={() => {
                      setShowExtendModal(false);
                      void beginCheckoutFlow();
                    }}
                  >
                    Proceed
                  </button>
                </div>
              </div>
            </div>
        </PersistentModalPortal>

        {/* Recurring subscriber buying one-time pack */}
        <PersistentModalPortal open={showRecurringTopupModal} mounted={mountedModals.recurringTopup}>
            <div aria-hidden={!showRecurringTopupModal} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${showRecurringTopupModal ? '' : 'pointer-events-none invisible'}`}>
              <div
                className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${recurringTopupVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={() => setShowRecurringTopupModal(false)}
              />
              <div
                className={`relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${recurringTopupVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.99]'}`}
              >
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Top up your subscription</h3>
                <p className="mt-2 text-xs">
                  You&apos;re currently on <strong>{recurringPlanName || 'an active subscription'}</strong>{recurringRenewsAt ? ` (renews on ${new Date(recurringRenewsAt).toLocaleString()})` : ''}.
                </p>
                <p className="mt-2 text-xs">
                  Buying <strong>{plan.name}</strong> adds a one-time pack on top of your subscription. Here&apos;s what to expect:
                </p>
                <ul className="ml-4 mt-1 list-disc space-y-1 text-xs">
                  <li>A one-time charge of {formatPrice(plan.priceCents, currency)} today</li>
                  {plan.tokenLimit && plan.tokenLimit > 0 ? (
                    <li>Immediate deposit of {plan.tokenLimit.toLocaleString()} {tokenLabel}</li>
                  ) : (
                    <li>Immediate access to this pack&apos;s benefits</li>
                  )}
                  <li>Your subscription keeps its renewal schedule{recurringRenewsAt ? ' and next charge date' : ''}; no plan changes are made</li>
                  <li>Tokens from this pack stack with your subscription balance without resetting it</li>
                </ul>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                    onClick={() => setShowRecurringTopupModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded bg-[color:rgb(var(--accent-primary))] px-3 py-1 text-sm text-white text-actual-white transition-colors hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.55))]"
                    disabled={demoReadOnlyMode}
                    onClick={() => {
                      setShowRecurringTopupModal(false);
                      void beginCheckoutFlow();
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
        </PersistentModalPortal>

        {/* Proration confirmation modal for recurring plan changes */}
        <PersistentModalPortal open={showProrationModal} mounted={mountedModals.proration}>
            <div aria-hidden={!showProrationModal} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${showProrationModal ? '' : 'pointer-events-none invisible'}`}>
              <div className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${prorationVisible ? 'opacity-100' : 'opacity-0'}`} onClick={closeProrationModal} />
              <div className={`relative w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 shadow-2xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${prorationVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {prorationPreview?.downgradeScheduledAtCycleEnd
                        ? 'Downgrade at end of cycle'
                        : prorationPreview?.isEstimate ? 'Estimated proration' : 'Review proration'}
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {prorationPreview?.downgradeScheduledAtCycleEnd
                        ? 'Your payment provider does not support immediate downgrades. The new plan will take effect at the end of your current billing period.'
                        : 'Switching plans now will charge or credit you based on the time left on your current billing period.'}
                    </p>
                  </div>
                  <button
                    onClick={closeProrationModal}
                    className="rounded-full bg-neutral-200/80 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                  >
                    Close
                  </button>
                </div>

                {prorationError ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {prorationError}
                  </div>
                ) : null}

                {prorationPreview ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-700 dark:bg-neutral-800/60">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Current plan</span>
                        <span>{prorationPreview.currentPlan.name}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-neutral-500 dark:text-neutral-400">
                        <span>Price</span>
                        <span>{formatCurrency(prorationPreview.currentPlan.priceCents, prorationPreview.currency)}</span>
                      </div>
                      {prorationPreview.currentPeriodEnd && (
                        <div className="mt-2 flex items-center justify-between text-neutral-500 dark:text-neutral-400">
                          <span>Renews on</span>
                          <span>{new Date(prorationPreview.currentPeriodEnd).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs shadow-inner dark:border-neutral-700 dark:bg-neutral-900/40">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">New plan</span>
                        <span>{prorationPreview.targetPlan.name}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-neutral-500 dark:text-neutral-400">
                        <span>Price</span>
                        <span>{formatCurrency(prorationPreview.targetPlan.priceCents, prorationPreview.currency)}</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Proration breakdown</h4>
                      <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 text-xs dark:border-neutral-700 dark:bg-neutral-800/40">
                        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700/60">
                          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700/40">
                            {prorationPreview.lineItems.map((line, idx) => (
                              <tr key={line.id ?? `line-${idx}`}>
                                <td className="px-4 py-2 align-top text-neutral-600 dark:text-neutral-300">
                                  {line.description || (line.proration ? 'Proration adjustment' : 'Charge')}
                                </td>
                                <td className={`px-4 py-2 text-right font-mono text-[11px] ${line.amount < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-700 dark:text-neutral-200'}`}>
                                  {line.amount < 0 ? '-' : ''}{formatCurrency(Math.abs(line.amount), prorationPreview.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60">
                      <span>
                        {prorationPreview.downgradeScheduledAtCycleEnd
                          ? 'Due now'
                          : prorationPreview.isEstimate ? 'Estimated total due now' : 'Total due now'}
                      </span>
                      <span>
                        {prorationPreview.downgradeScheduledAtCycleEnd
                          ? 'No charge'
                          : formatCurrency(prorationPreview.amountDue, prorationPreview.currency)}
                      </span>
                    </div>
                    {prorationPreview.downgradeScheduledAtCycleEnd && prorationPreview.currentPeriodEnd && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-200">
                        Your current plan will remain active until <strong>{new Date(prorationPreview.currentPeriodEnd).toLocaleDateString()}</strong>. After that, your subscription will automatically switch to <strong>{prorationPreview.targetPlan.name}</strong>.
                      </div>
                    )}
                    {prorationPreview.isEstimate && !prorationPreview.downgradeScheduledAtCycleEnd && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-200">
                        This is an estimate based on the time remaining in your billing cycle. The final amount charged may vary slightly as it is calculated by the payment provider.
                      </div>
                    )}
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-200">
                      {/* Use plan token name when available, otherwise fall back to generic 'tokens' label */}
                      {(() => {
                        const planTokenName = plan.tokenName && String(plan.tokenName).trim() ? String(plan.tokenName).trim() : 'tokens';
                        return (
                          <div>
                            {recurringRenewalResetsTokens
                              ? <>Switching recurring plans will reset your remaining <strong>{planTokenName}</strong> balance to the new plan&apos;s allotment.</>
                              : <>Switching recurring plans keeps your current <strong>{planTokenName}</strong> balance (it is not reset when the new plan starts).</>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                    <span className="h-3 w-3 animate-ping rounded-full bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.60))]" />
                    Calculating proration…
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={closeProrationModal}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                    disabled={prorationConfirming}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmProration}
                    className="rounded bg-[color:rgb(var(--accent-primary))] px-4 py-1.5 text-sm font-semibold text-white text-actual-white shadow-sm transition hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.55))] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={prorationConfirming || !prorationPreview}
                  >
                    {prorationConfirming
                      ? 'Scheduling…'
                      : prorationPreview?.downgradeScheduledAtCycleEnd
                        ? 'Schedule downgrade'
                        : planSwitchKind === 'upgrade'
                          ? 'Confirm upgrade'
                          : planSwitchKind === 'downgrade'
                            ? 'Confirm downgrade'
                            : 'Confirm change'}
                  </button>
                </div>
              </div>
            </div>
        </PersistentModalPortal>

        {/* Plan switch timing modal (recurring -> recurring) */}
        <PersistentModalPortal open={showPlanSwitchModal} mounted={mountedModals.planSwitch}>
            <div aria-hidden={!showPlanSwitchModal} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${showPlanSwitchModal ? '' : 'pointer-events-none invisible'}`}>
              <div
                className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${planSwitchVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={() => setShowPlanSwitchModal(false)}
              />
              <div
                className={`relative w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 shadow-2xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${planSwitchVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Switch your plan</h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Choose when you want <strong>{plan.name}</strong> to take effect.
                    </p>
                    <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                      You&apos;re currently on <strong>{recurringPlanName || 'an active subscription'}</strong>
                      {recurringRenewsAt ? ` (renews on ${new Date(recurringRenewsAt).toLocaleString()})` : ''}.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPlanSwitchModal(false)}
                    className="rounded-full bg-neutral-200/80 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-700 dark:bg-neutral-800/50 flex h-full flex-col">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Switch now</div>
                    {planSwitchCapabilityLoading ? (
                      <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                        Checking what your payment provider supports…
                      </p>
                    ) : planSwitchProrationPending ? (
                      <>
                        <p className="mt-1 text-amber-600 dark:text-amber-300">
                          Your previous plan change is still being processed by the payment provider.
                        </p>
                        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
                          Please wait a moment for the invoice to be captured before switching again.
                        </p>
                      </>
                    ) : planSwitchSupportsProration ? (
                      <>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                          {planSwitchProviderKey === 'paystack'
                            ? `Starts your ${plan.name} switch now, but activation can wait for Paystack to confirm the charge.`
                            : 'Applies the new plan immediately with proration. You may be charged or credited today.'}
                        </p>
                        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
                          {planSwitchProviderKey === 'paystack'
                            ? 'If Paystack takes time to debit the saved authorization, your plan will stay in an awaiting-confirmation state until the provider confirms payment.'
                            : 'You will review the proration breakdown before confirming.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                          Starts the new plan immediately after checkout. No proration calculation is shown for your current payment provider.
                        </p>
                        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
                          After checkout, you can activate the new plan right away from your dashboard.
                        </p>
                      </>
                    )}
                    <div className="mt-auto pt-4">
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={planSwitchCapabilityLoading || planSwitchProrationPending || prorationLoading || prorationConfirming || checkingExisting || loadingCoupons || pending}
                        onClick={() => {
                          openPlanSwitchConfirm('now');
                        }}
                      >
                        {planSwitchKind === 'upgrade' ? 'Switch now (upgrade)' : planSwitchKind === 'downgrade' ? 'Switch now (downgrade)' : 'Switch now'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs shadow-inner dark:border-neutral-700 dark:bg-neutral-900/40 flex h-full flex-col">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Switch at end of cycle</div>
                    <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                      Keeps your current plan until renewal, then starts <strong>{plan.name}</strong> automatically.
                    </p>
                    <p className="mt-2 text-neutral-500 dark:text-neutral-400">
                      This schedules the new plan for renewal (no proration preview).
                    </p>
                    <div className="mt-auto pt-4">
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900"
                        disabled={checkingExisting || loadingCoupons || pending}
                        onClick={() => {
                          openPlanSwitchConfirm('cycle_end');
                        }}
                      >
                        Switch at end of cycle
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-200">
                  {recurringRenewalResetsTokens
                    ? <>When a new recurring plan starts, your remaining <strong>{plan.tokenName && String(plan.tokenName).trim() ? String(plan.tokenName).trim() : 'tokens'}</strong> balance is reset to the new plan&apos;s allotment.</>
                    : <>When a new recurring plan starts, your current <strong>{plan.tokenName && String(plan.tokenName).trim() ? String(plan.tokenName).trim() : 'tokens'}</strong> balance is preserved (not reset).</>}
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                    onClick={() => setShowPlanSwitchModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
        </PersistentModalPortal>

        {/* Plan switch confirmation modal (extra confirmation step) */}
        <PersistentModalPortal open={showPlanSwitchConfirmModal} mounted={mountedModals.planSwitchConfirm}>
            <div aria-hidden={!showPlanSwitchConfirmModal} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${showPlanSwitchConfirmModal ? '' : 'pointer-events-none invisible'}`}>
              <div
                className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${planSwitchConfirmVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={closePlanSwitchConfirm}
              />
              <div
                className={`relative w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 shadow-2xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${planSwitchConfirmVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Confirm plan change</h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      You&apos;re about to change from <strong>{recurringPlanName || 'your current plan'}</strong> to <strong>{plan.name}</strong>.
                    </p>
                  </div>
                  <button
                    onClick={closePlanSwitchConfirm}
                    className="rounded-full bg-neutral-200/80 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-200">
                  {planSwitchConfirmChoice === 'now' ? (
                    planSwitchSupportsProration ? (
                      <>
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">Switch now</div>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                          The new plan applies immediately. You&apos;ll review the proration breakdown next and then confirm.
                        </p>
                        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
                          You may be charged or credited today.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">Switch now</div>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                          You&apos;ll go through checkout to start the new plan. No proration preview is shown for your current payment provider.
                        </p>
                        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
                          After checkout, you can activate the new plan right away from your dashboard.
                        </p>
                      </>
                    )
                  ) : (
                    <>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">Switch at end of cycle</div>
                      <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                        Your current plan stays active until renewal. <strong>{plan.name}</strong> will start automatically at the end of the current billing cycle.
                      </p>
                      <p className="mt-2 text-neutral-500 dark:text-neutral-400">
                        This schedules the change (no proration preview).
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-200">
                  {recurringRenewalResetsTokens
                    ? <>When a new recurring plan starts, your remaining <strong>{plan.tokenName && String(plan.tokenName).trim() ? String(plan.tokenName).trim() : 'tokens'}</strong> balance is reset to the new plan&apos;s allotment.</>
                    : <>When a new recurring plan starts, your current <strong>{plan.tokenName && String(plan.tokenName).trim() ? String(plan.tokenName).trim() : 'tokens'}</strong> balance is preserved (not reset).</>}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                    onClick={backToPlanSwitchTiming}
                    disabled={pending}
                  >
                    Back
                  </button>
                  <button
                    className="rounded bg-[color:rgb(var(--accent-primary))] px-4 py-1.5 text-sm font-semibold text-white text-actual-white shadow-sm transition hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.55))] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={executePlanSwitchConfirm}
                    disabled={
                      pending ||
                      checkingExisting ||
                      loadingCoupons ||
                      (planSwitchConfirmChoice === 'now'
                        ? (planSwitchCapabilityLoading || planSwitchProrationPending || prorationLoading || prorationConfirming)
                        : false)
                    }
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
        </PersistentModalPortal>

        {/* Replace warning modal for recurring plans replacing non-recurring */}
        <PersistentModalPortal open={showReplaceModal} mounted={mountedModals.replace}>
            <div aria-hidden={!showReplaceModal} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${showReplaceModal ? '' : 'pointer-events-none invisible'}`}>
              <div className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${replaceVisible ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowReplaceModal(false)} />
              <div className={`relative max-w-md w-full rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${replaceVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.99]'}`}>
                <h3 className="font-semibold text-yellow-500 dark:text-yellow-400">⚠️ Replace existing access?</h3>
                <p className="mt-2 text-xs">
                  You currently have an active <strong>{existingPlanName || 'one-time'}</strong> plan{existingExpiresAt ? ` until ${new Date(existingExpiresAt).toLocaleString()}` : ''}.
                </p>
                <p className="mt-2 text-xs">
                  Subscribing to <strong>{plan.name}</strong> (a recurring subscription) will <strong className="text-yellow-500 dark:text-yellow-400">replace</strong> your current access. Your existing plan will be canceled and the new subscription will start immediately.
                </p>
                {plan.tokenLimit && plan.tokenLimit > 0 && (
                  <p className="mt-2 text-xs">
                    You will receive {plan.tokenLimit} {plan.tokenName || 'tokens'} with this subscription.
                  </p>
                )}
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                    onClick={() => setShowReplaceModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded bg-yellow-500 px-3 py-1 text-sm text-white transition-colors hover:bg-yellow-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300 dark:bg-yellow-600 dark:hover:bg-yellow-500"
                    disabled={demoReadOnlyMode}
                    onClick={() => {
                      setShowReplaceModal(false);
                      void beginCheckoutFlow();
                    }}
                  >
                    Replace and subscribe
                  </button>
                </div>
              </div>
            </div>
        </PersistentModalPortal>

        {/* Coupon selection modal */}
        <PersistentModalPortal open={showCouponModal} mounted={mountedModals.coupon}>
            <div aria-hidden={!showCouponModal} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${showCouponModal ? '' : 'pointer-events-none invisible'}`}>
              <div
                className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${couponVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={() => {
                  setShowCouponModal(false);
                  setSelectedCouponId(null);
                }}
              />
              <div className={`relative max-w-lg w-full space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 shadow-xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${couponVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.99]'}`}>
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Apply a coupon?</h3>
                  <p className="mt-1 text-xs">
                    Redeemed coupons can be applied once at checkout. Choose one below or continue without a coupon.
                  </p>
                </div>
                {couponError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {couponError}
                  </div>
                )}
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {couponOptions.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 transition-colors ${option.id === selectedCouponId
                        ? 'border-blue-500 bg-blue-50 text-neutral-900 dark:bg-blue-500/10'
                        : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500'
                        }`}
                    >
                      <input
                        type="radio"
                        name="coupon-choice"
                        checked={option.id === selectedCouponId}
                        onChange={() => setSelectedCouponId(option.id)}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold tracking-[0.2em] text-neutral-800 dark:text-neutral-100">{option.code}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-300">{couponDiscountLabel(option)}</div>
                        {option.description && <div className="mt-1 text-xs text-neutral-400 dark:text-neutral-400">{option.description}</div>}
                      </div>
                    </label>
                  ))}
                  {couponOptions.length === 0 && (
                    <div className="text-xs text-neutral-500">No coupons available right now.</div>
                  )}
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <button
                    className="text-xs text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.92))] hover:text-[color:rgb(var(--accent-primary))] dark:text-neutral-400 dark:hover:text-neutral-100"
                    onClick={() => confirmCouponSelection(false)}
                  >
                    Skip coupon
                  </button>
                  <div className="flex gap-2 justify-end">
                    <button
                      className="rounded border border-neutral-300 px-3 py-1 text-sm text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                      onClick={() => {
                        setShowCouponModal(false);
                        setSelectedCouponId(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded bg-[color:rgb(var(--accent-primary))] px-3 py-1 text-sm text-white text-actual-white transition-colors hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.55))] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => confirmCouponSelection(true)}
                      disabled={couponOptions.length === 0}
                    >
                      Apply coupon
                    </button>
                  </div>
                </div>
              </div>
            </div>
        </PersistentModalPortal>

        <PersistentModalPortal open={showAuthModal} mounted={mountedModals.auth}>
            <div aria-hidden={!showAuthModal} className={`fixed inset-0 z-[60] flex items-center justify-center p-4 ${showAuthModal ? '' : 'pointer-events-none invisible'}`}>
              <div
                className={`fixed inset-0 bg-black/40 transition-opacity duration-150 ${authModalVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={closeAuthModal}
              />
              <div
                className={`relative w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-700 shadow-2xl transition-all duration-150 dark:border-neutral-800 dark:bg-neutral-950/95 dark:text-neutral-200 ${authModalVisible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-[0.99] opacity-0'
                  }`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Sign in to continue</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Complete checkout in seconds. You&apos;ll return right to where you left off.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAuthModal}
                    className="rounded-full border border-neutral-300 px-2 py-1 text-xs text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                  >
                    Close
                  </button>
                </div>

                <div className="mb-4 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <button
                    type="button"
                    onClick={() => setAuthView('sign-in')}
                    className={`rounded-full border px-3 py-1 transition ${authView === 'sign-in'
                      ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                      : 'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200'
                      }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthView('sign-up')}
                    className={`rounded-full border px-3 py-1 transition ${authView === 'sign-up'
                      ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                      : 'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200'
                      }`}
                  >
                    Create account
                  </button>
                </div>

                <div className="w-full max-w-[28rem] rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
                  {authView === 'sign-in' ? (
                    <AuthSignIn
                      appearance={getAuthFormAppearance('modal')}
                      routing="hash"
                      forceRedirectUrl={authReturnPath}
                      signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(authReturnPath)}`}
                    />
                  ) : (
                    <AuthSignUp
                      appearance={getAuthFormAppearance('modal')}
                      routing="hash"
                      forceRedirectUrl={authReturnPath}
                      signInUrl={`/sign-in?redirect_url=${encodeURIComponent(authReturnPath)}`}
                    />
                  )}
                </div>

                <p className="mt-4 text-center text-[11px] text-neutral-500 dark:text-neutral-500">
                  Having trouble? <Link href="/contact" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">Contact support</Link>
                </p>
              </div>
            </div>
        </PersistentModalPortal>
      </div>
    </div>
  );
}
