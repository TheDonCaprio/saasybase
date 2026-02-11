'use client';

import React from 'react';
import { PAYMENT_PROVIDERS } from '@/lib/payment/provider-config';

export interface PaymentProviderBadgeProps {
    /** Provider ID (e.g., 'stripe', 'paystack') */
    provider: string | null | undefined;
    /** Display style variant */
    variant?: 'badge' | 'logo' | 'text' | 'icon';
    /** Size of the badge */
    size?: 'xs' | 'sm' | 'md' | 'lg';
    /** Additional class names */
    className?: string;
    /** Show provider name text alongside logo */
    showName?: boolean;
}

const sizeClasses = {
    xs: { badge: 'text-xs px-2.5 py-1', logo: 'h-5', icon: 'w-5 h-5', fa: 'text-base' },
    sm: { badge: 'text-sm px-3 py-1.5', logo: 'h-6', icon: 'w-6 h-6', fa: 'text-lg' },
    md: { badge: 'text-base px-4 py-2', logo: 'h-7', icon: 'w-7 h-7', fa: 'text-xl' },
    lg: { badge: 'text-lg px-5 py-2.5', logo: 'h-9', icon: 'w-9 h-9', fa: 'text-2xl' },
};

/**
 * Displays a payment provider's logo, badge, or name.
 * Designed to be extensible for future providers.
 */
export function PaymentProviderBadge({
    provider,
    variant = 'badge',
    size = 'sm',
    className = '',
    showName = true,
}: PaymentProviderBadgeProps) {
    const normalizedProvider = provider?.toLowerCase() || '';
    const config = PAYMENT_PROVIDERS[normalizedProvider];
    
    if (!config) {
        // Don't render anything if no provider and showName is false (icon-only mode)
        if (!provider && !showName) {
            return null;
        }
        // Fallback for unknown providers
        if (variant === 'text') {
            return <span className={`capitalize ${className}`}>{provider || '—'}</span>;
        }
        return (
            <span className={`inline-flex items-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-medium uppercase tracking-wide ${sizeClasses[size].badge} ${className}`}>
                {provider || '—'}
            </span>
        );
    }

    // Provider-specific colors
    const providerColors: Record<string, { bg: string; text: string; border: string }> = {
        stripe: {
            bg: 'bg-[#635BFF]/10 dark:bg-[#635BFF]/20',
            text: 'text-[#635BFF] dark:text-[#a5a0ff]',
            border: 'border-[#635BFF]/20 dark:border-[#635BFF]/40',
        },
        paystack: {
            bg: 'bg-[#00C3F7]/10 dark:bg-[#00C3F7]/20',
            text: 'text-[#00A3D9] dark:text-[#00C3F7]',
            border: 'border-[#00C3F7]/20 dark:border-[#00C3F7]/40',
        },
        razorpay: {
            bg: 'bg-[#3293FB]/10 dark:bg-[#3293FB]/20',
            text: 'text-[#1b7de6] dark:text-[#7ab8ff]',
            border: 'border-[#3293FB]/20 dark:border-[#3293FB]/40',
        },
    };

    const colors = providerColors[normalizedProvider] || {
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-700',
    };

    // Text-only variant
    if (variant === 'text') {
        return <span className={`${colors.text} ${className}`}>{config.displayName}</span>;
    }

    // Logo-only variant
    if (variant === 'logo') {
        if (config.logoSvg) {
            const scaleClass = normalizedProvider === 'paystack' ? 'scale-75' : '';
            return (
                <span
                    className={`inline-flex items-center leading-none [&>svg]:block [&>svg]:h-full [&>svg]:w-auto ${colors.text} ${sizeClasses[size].logo} ${scaleClass} ${className}`}
                    dangerouslySetInnerHTML={{ __html: config.logoSvg }}
                    title={config.displayName}
                    aria-label={config.displayName}
                />
            );
        }
    }

    // Icon variant (small circle with first letter or mini logo)
    if (variant === 'icon') {
        const scaleClass = normalizedProvider === 'paystack' ? 'scale-75' : '';
        return (
            <span
                className={`inline-flex items-center justify-center ${colors.text} ${sizeClasses[size].icon} ${className}`}
                title={config.displayName}
            >
                {config.logoSvg ? (
                    <span
                        className={`inline-block leading-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${scaleClass}`}
                        dangerouslySetInnerHTML={{ __html: config.logoSvg }}
                        aria-hidden="true"
                    />
                ) : (
                    <span className="font-bold">{config.displayName.charAt(0).toUpperCase()}</span>
                )}
            </span>
        );
    }

    // Default badge variant
    return (
        <span
            className={`inline-flex items-center gap-1.5 ${colors.text} font-medium ${sizeClasses[size].badge} ${className}`}
            title={config.description}
        >
            {normalizedProvider === 'paystack' && config.logoSvg ? (
                <span
                    className={`inline-block leading-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${sizeClasses[size].icon} scale-75`}
                    dangerouslySetInnerHTML={{ __html: config.logoSvg }}
                    aria-hidden="true"
                />
            ) : config.logoSvg ? (
                <span
                    className={`inline-block leading-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${sizeClasses[size].icon}`}
                    dangerouslySetInnerHTML={{ __html: config.logoSvg }}
                    aria-hidden="true"
                />
            ) : null}
            {showName && <span className="uppercase tracking-wide">{config.displayName}</span>}
        </span>
    );
}

export default PaymentProviderBadge;
