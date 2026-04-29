"use client";

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faCheck, 
    faTimes, 
    faExternalLinkAlt, 
    faInfoCircle,
    faLock,
    faSync,
    faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import { showToast } from '../ui/Toast';
import PaymentProviderBadge from '../ui/PaymentProviderBadge';
import clsx from 'clsx';

interface EnvVarStatus {
    key: string;
    label: string;
    isSet: boolean;
    isPublic: boolean;
}

interface ProviderFeatures {
    subscriptions: boolean;
    oneTimePayments: boolean;
    embeddedCheckout: boolean;
    customerPortal: boolean;
    coupons: 'provider' | 'in-app' | false;
    refunds: boolean;
    proration: boolean;
    subscriptionUpdates: boolean;
}

interface PaymentProviderInfo {
    id: string;
    displayName: string;
    description: string;
    logoUrl?: string;
    features: ProviderFeatures;
    supportedCurrencies: string[];
    docsUrl: string;
    configured: boolean;
    isActive: boolean;
    envVarStatus: EnvVarStatus[];
    webhookSecretSet: boolean;
}

interface PaymentProvidersResponse {
    activeProvider: string;
    providers: PaymentProviderInfo[];
}

const FEATURE_LABELS: Record<keyof ProviderFeatures, string> = {
    subscriptions: 'Recurring Subscriptions',
    oneTimePayments: 'One-time Payments',
    embeddedCheckout: 'Embedded Checkout',
    customerPortal: 'Customer Portal',
    coupons: 'Coupons & Discounts',
    refunds: 'Refunds',
    proration: 'Proration (Plan Switching)',
    subscriptionUpdates: 'Subscription Updates',
};

// Common currency options for display (used as labels/symbols when known)
const CURRENCY_OPTIONS = [
    { code: 'USD', label: 'US Dollar', symbol: '$' },
    { code: 'EUR', label: 'Euro', symbol: '€' },
    { code: 'GBP', label: 'British Pound', symbol: '£' },
    { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$' },
    { code: 'MYR', label: 'Malaysian Ringgit', symbol: 'RM' },
    { code: 'NGN', label: 'Nigerian Naira', symbol: '₦' },
    { code: 'GHS', label: 'Ghanaian Cedi', symbol: '₵' },
    { code: 'ZAR', label: 'South African Rand', symbol: 'R' },
    { code: 'KES', label: 'Kenyan Shilling', symbol: 'KSh' },
    { code: 'CAD', label: 'Canadian Dollar', symbol: 'CA$' },
    { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
    { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
    { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
    { code: 'CHF', label: 'Swiss Franc', symbol: 'CHF' },
    { code: 'HKD', label: 'Hong Kong Dollar', symbol: 'HK$' },
    { code: 'NZD', label: 'New Zealand Dollar', symbol: 'NZ$' },
    { code: 'SEK', label: 'Swedish Krona', symbol: 'kr' },
    { code: 'NOK', label: 'Norwegian Krone', symbol: 'kr' },
    { code: 'DKK', label: 'Danish Krone', symbol: 'kr' },
];

const CURRENCY_META_BY_CODE = new Map(CURRENCY_OPTIONS.map((c) => [c.code.toUpperCase(), c] as const));

const RECOMMENDED_CURRENCY_CODES = [
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'NZD',
    'JPY',
    'CHF',
    'SEK',
    'NOK',
    'DKK',
    'SGD',
    'HKD',
    'INR',
];

function normalizeCurrencyCode(raw: string) {
    return raw.trim().replace(/^['\"]|['\"]$/g, '').toUpperCase();
}

function buildCurrencyOptionsForProvider(supported: string[]) {
    const uniqueSupported = Array.from(
        new Set((supported || []).map((c) => String(c || '').toUpperCase()).filter(Boolean))
    );

    return uniqueSupported.map((code) => {
        const meta = CURRENCY_META_BY_CODE.get(code);
        return {
            code,
            label: meta?.label ?? code,
            symbol: meta?.symbol ?? code,
        };
    });
}

export function PaymentProvidersPanel() {
    const [data, setData] = useState<PaymentProvidersResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Initialize with empty string to indicate "loading" state - will be populated from API
    const [defaultCurrency, setDefaultCurrency] = useState<string>('');
    const [currencyLoading, setCurrencyLoading] = useState(false);
    const [syncingCatalog, setSyncingCatalog] = useState(false);
    const [showAdvancedCurrency, setShowAdvancedCurrency] = useState(false);
    const [customCurrency, setCustomCurrency] = useState('');

    const fetchProviders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/payment-providers');
            if (!response.ok) {
                throw new Error('Failed to fetch payment providers');
            }
            const json = await response.json();
            setData(json);
        } catch (err) {
            setError((err as Error).message);
            showToast('Failed to load payment providers', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProviders();
        // Fetch current default currency setting (falls back to PAYMENTS_CURRENCY or the provider default)
        fetch('/api/admin/settings?key=DEFAULT_CURRENCY')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.value) {
                    setDefaultCurrency(data.value.toUpperCase());
                } else {
                    // No setting found - default will be determined by active provider
                    setDefaultCurrency('');
                }
            })
            .catch(() => { 
                setDefaultCurrency('');
            });
    }, [fetchProviders]);

    // Ensure the selected currency is valid for the active provider.
    // If the stored DEFAULT_CURRENCY is not supported by the active provider,
    // fall back to the provider's first supported currency.
    useEffect(() => {
        if (!data) return;
        const activeProviderId = data.activeProvider.toLowerCase();
        const active = data.providers.find((p) => p.id.toLowerCase() === activeProviderId);

        // We only enforce strict currencies for providers we intentionally restrict.
        const isRestrictedProvider = activeProviderId === 'paystack' || activeProviderId === 'razorpay';
        const restrictedSupported = (active?.supportedCurrencies || []).map((c) => String(c).toUpperCase());
        const fallback = isRestrictedProvider ? (restrictedSupported[0] || 'USD') : 'USD';

        setDefaultCurrency((prev) => {
            const next = normalizeCurrencyCode(prev || '');
            if (!next) return fallback;
            if (isRestrictedProvider && restrictedSupported.length > 0 && !restrictedSupported.includes(next)) return fallback;
            return next;
        });
    }, [data]);

    const handleCurrencyChange = async (currency: string) => {
        setCurrencyLoading(true);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'DEFAULT_CURRENCY', value: normalizeCurrencyCode(currency) })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Failed to save');
            setDefaultCurrency(normalizeCurrencyCode(currency));
            showToast('Default currency updated', 'success');
        } catch {
            showToast('Failed to update currency', 'error');
        } finally {
            setCurrencyLoading(false);
        }
    };

    const handleSyncProviders = async () => {
        setSyncingCatalog(true);
        try {
            const res = await fetch('/api/admin/billing/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope: 'all' }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                showToast(json?.error || 'Failed to sync billing catalog across providers', 'error');
                return;
            }
            showToast('Providers synced (plans + coupons)', 'success');
        } catch {
            showToast('Network error syncing providers', 'error');
        } finally {
            setSyncingCatalog(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
                <FontAwesomeIcon icon={faExclamationTriangle} className="h-8 w-8 text-red-500 mb-3" />
                <p className="text-red-700 dark:text-red-300">{error || 'Failed to load payment providers'}</p>
                <button
                    onClick={fetchProviders}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-800/30 dark:text-red-200 dark:hover:bg-red-800/50"
                >
                    <FontAwesomeIcon icon={faSync} className="h-4 w-4" />
                    Retry
                </button>
            </div>
        );
    }

    const activeProviderId = data.activeProvider.toLowerCase();
    const activeProviderInfo = data.providers.find((p) => p.id.toLowerCase() === activeProviderId);
    const isRestrictedCurrencyProvider = activeProviderId === 'paystack' || activeProviderId === 'razorpay';
    const isAdvancedProvider = activeProviderId === 'stripe' || activeProviderId === 'paddle';

    const baseCurrencyCodes = isRestrictedCurrencyProvider
        ? (activeProviderInfo?.supportedCurrencies || []).map((c) => String(c).toUpperCase())
        : RECOMMENDED_CURRENCY_CODES;

    const normalizedCurrentCurrency = normalizeCurrencyCode(defaultCurrency || '');
    const selectCurrencyCodes =
        normalizedCurrentCurrency && !baseCurrencyCodes.includes(normalizedCurrentCurrency)
            ? [normalizedCurrentCurrency, ...baseCurrencyCodes]
            : baseCurrencyCodes;

    const currencyOptionsForSelect = buildCurrencyOptionsForProvider(selectCurrencyCodes);

    return (
        <div className="space-y-6">
            {/* Active Provider Notice */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <div>
                            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                Active Provider: <span className="font-bold">{data.activeProvider.charAt(0).toUpperCase() + data.activeProvider.slice(1)}</span>
                            </p>
                            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                                Set <code className="rounded bg-blue-100 px-1 dark:bg-blue-800/50">PAYMENT_PROVIDER</code> environment variable to switch providers.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <button
                            onClick={handleSyncProviders}
                            disabled={syncingCatalog}
                            title="Sync plans and coupons across all configured payment providers"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        >
                            <FontAwesomeIcon icon={faSync} className={clsx('h-4 w-4', syncingCatalog && 'animate-spin')} />
                            {syncingCatalog ? 'Syncing…' : 'Sync providers'}
                        </button>
                        <button
                            onClick={fetchProviders}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        >
                            <FontAwesomeIcon icon={faSync} className={clsx('h-4 w-4', loading && 'animate-spin')} />
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Default Currency Selector */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                            Default Currency
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-neutral-400 mt-1">
                            Used when creating prices.
                            {isRestrictedCurrencyProvider
                                ? ' Options are limited to the active provider’s supported currencies.'
                                : isAdvancedProvider
                                ? ' Shows a recommended shortlist, with an advanced override.'
                                : ' Shows a recommended shortlist.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={defaultCurrency}
                            onChange={(e) => handleCurrencyChange(e.target.value)}
                            disabled={currencyLoading}
                            className={clsx(
                                'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900',
                                'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100',
                                'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent',
                                currencyLoading && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            {currencyOptionsForSelect.map((c) => (
                                <option key={c.code} value={c.code}>
                                    {c.symbol} {c.code} - {c.label}
                                </option>
                            ))}
                        </select>
                        {isAdvancedProvider && !isRestrictedCurrencyProvider ? (
                            <button
                                type="button"
                                onClick={() => setShowAdvancedCurrency((s) => !s)}
                                className="text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                            >
                                {showAdvancedCurrency ? 'Hide advanced' : 'Advanced'}
                            </button>
                        ) : null}
                        {currencyLoading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                        )}
                    </div>
                </div>

                {isAdvancedProvider && showAdvancedCurrency && !isRestrictedCurrencyProvider ? (
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                                Set a custom ISO currency code
                            </label>
                            <input
                                value={customCurrency}
                                onChange={(e) => setCustomCurrency(e.target.value.toUpperCase())}
                                placeholder="e.g. PLN"
                                className={clsx(
                                    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900',
                                    'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100',
                                    'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                                )}
                            />
                            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
                                Stripe/Paddle support many currencies; use an ISO 4217 code. Server validation only applies to restricted providers.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={currencyLoading || normalizeCurrencyCode(customCurrency).length < 3}
                                onClick={() => handleCurrencyChange(customCurrency)}
                                className={clsx(
                                    'inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white',
                                    'hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                )}
                            >
                                Save custom
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomCurrency('');
                                    setShowAdvancedCurrency(false);
                                }}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Provider Cards */}
            <div className="grid gap-6 lg:grid-cols-2">
                {data.providers.map((provider) => (
                    <ProviderCard key={provider.id} provider={provider} />
                ))}
            </div>
        </div>
    );
}

function ProviderCard({ provider }: { provider: PaymentProviderInfo }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            className={clsx(
                'rounded-2xl border p-6 transition-all',
                provider.isActive
                    ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-white shadow-lg dark:border-emerald-500/40 dark:from-emerald-500/10 dark:to-transparent'
                    : provider.configured
                    ? 'border-slate-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/60'
                    : 'border-slate-200 bg-slate-50 opacity-75 dark:border-neutral-700 dark:bg-neutral-900/30'
            )}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        'flex h-12 w-12 items-center justify-center rounded-xl',
                        provider.isActive 
                            ? 'bg-emerald-100 dark:bg-emerald-500/20' 
                            : 'bg-slate-100 dark:bg-neutral-800'
                    )}>
                        <PaymentProviderBadge
                            provider={provider.id}
                            variant="icon"
                            size="md"
                            showName={false}
                            className={clsx(
                                provider.isActive
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-500 dark:text-neutral-400'
                            )}
                        />
                    </div>
                    <div>
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
                            {provider.displayName}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-neutral-400">
                            {provider.id === 'stripe'
                                ? '135+ currencies'
                                : provider.id === 'paddle'
                                ? 'Multiple currencies'
                                : provider.supportedCurrencies.slice(0, 5).join(', ')}
                            {provider.id !== 'stripe' &&
                                provider.id !== 'paddle' &&
                                provider.supportedCurrencies.length > 5 &&
                                ` +${provider.supportedCurrencies.length - 5} more`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {provider.isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                            Active
                        </span>
                    )}
                    {!provider.configured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="h-3 w-3" />
                            Not Configured
                        </span>
                    )}
                </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-600 dark:text-neutral-400 mb-4">
                {provider.description}
            </p>

            {/* Environment Variables Status */}
            <div className="mb-4">
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 dark:text-neutral-500">
                    Configuration Status
                </h5>
                <div className="space-y-2">
                    {provider.envVarStatus.map((envVar) => (
                        <div key={envVar.key} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-slate-700 dark:text-neutral-300">
                                <FontAwesomeIcon 
                                    icon={envVar.isPublic ? faInfoCircle : faLock} 
                                    className="h-3 w-3 text-slate-400 dark:text-neutral-500" 
                                />
                                <code className="text-xs bg-slate-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                                    {envVar.key}
                                </code>
                            </span>
                            {envVar.isSet ? (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                    <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                                    <span className="text-xs">Set</span>
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                                    <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                                    <span className="text-xs">Missing</span>
                                </span>
                            )}
                        </div>
                    ))}
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700 dark:text-neutral-300">
                            <FontAwesomeIcon icon={faLock} className="h-3 w-3 text-slate-400 dark:text-neutral-500" />
                            <code className="text-xs bg-slate-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                                Webhook Secret
                            </code>
                        </span>
                        {provider.webhookSecretSet ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                                <span className="text-xs">Set</span>
                            </span>
                        ) : provider.id === 'paystack' ? (
                            <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400">
                                <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3" />
                                <span className="text-xs">Uses API Secret Key</span>
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="h-3 w-3" />
                                <span className="text-xs">Optional</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Features Toggle */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
            >
                {expanded ? 'Hide Features' : 'Show Features'}
            </button>

            {expanded && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-neutral-700">
                    <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 dark:text-neutral-500">
                        Supported Features
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.entries(provider.features).map(([key, supported]) => {
                            const isActive = supported === true || supported === 'provider' || supported === 'in-app';
                            const suffix = supported === 'provider' ? ' (Provider)'
                                : supported === 'in-app' ? ' (In-app)'
                                : '';
                            return (
                                <div 
                                    key={key}
                                    className={clsx(
                                        'flex items-center gap-2 text-sm rounded-lg px-2 py-1.5',
                                        isActive 
                                            ? 'text-slate-700 dark:text-neutral-300' 
                                            : 'text-slate-400 dark:text-neutral-500'
                                    )}
                                >
                                    <FontAwesomeIcon 
                                        icon={isActive ? faCheck : faTimes} 
                                        className={clsx(
                                            'h-3 w-3',
                                            isActive ? 'text-emerald-500' : 'text-slate-300 dark:text-neutral-600'
                                        )} 
                                    />
                                    <span>{FEATURE_LABELS[key as keyof ProviderFeatures]}{suffix}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Documentation Link */}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-neutral-700">
                <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                    <FontAwesomeIcon icon={faExternalLinkAlt} className="h-3 w-3" />
                    View Documentation
                </a>
            </div>
        </div>
    );
}

export default PaymentProvidersPanel;
