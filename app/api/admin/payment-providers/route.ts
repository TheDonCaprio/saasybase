import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { PAYMENT_PROVIDERS, getActivePaymentProvider, isProviderConfigured } from '@/lib/payment/provider-config';
import { Logger } from '@/lib/logger';
import { adminRateLimit } from '@/lib/rateLimit';
import { getProviderCurrency } from '@/lib/payment/registry';

/**
 * GET /api/admin/payment-providers
 * Returns list of available payment providers with their configuration status
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await requireAdmin();
        
        const rl = await adminRateLimit(userId, req, 'admin-providers:read', { limit: 60, windowMs: 60_000 });
        if (!rl.success && !rl.allowed) {
            return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
        }
        if (!rl.allowed) {
            const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
            return NextResponse.json(
                { error: 'Too many requests.' },
                { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } }
            );
        }

        const activeProvider = getActivePaymentProvider();
        const activeCurrency = getProviderCurrency(activeProvider);
        
        const providers = Object.values(PAYMENT_PROVIDERS).map(provider => {
            const configured = isProviderConfigured(provider.id);
            const isActive = provider.id === activeProvider;
            
            // Check which env vars are set (without exposing values)
            const envVarStatus = provider.requiredEnvVars.map(envVar => ({
                key: envVar.key,
                label: envVar.label,
                isSet: Boolean(process.env[envVar.key] && process.env[envVar.key] !== 'xxx'),
                isPublic: envVar.isPublic,
            }));

            const webhookSecretSet = Boolean(
                process.env[provider.webhookSecretEnvVar] && 
                process.env[provider.webhookSecretEnvVar] !== 'xxx'
            );

            return {
                id: provider.id,
                displayName: provider.displayName,
                description: provider.description,
                logoUrl: provider.logoUrl,
                features: provider.features,
                supportedCurrencies: provider.supportedCurrencies,
                docsUrl: provider.docsUrl,
                configured,
                isActive,
                envVarStatus,
                webhookSecretSet,
            };
        });

        return NextResponse.json({
            activeProvider,
            activeCurrency,
            providers,
        });
    } catch (err) {
        const res = toAuthGuardErrorResponse(err);
        if (res) return res;
        Logger.error('Failed to get payment providers', { error: (err as Error).message });
        return NextResponse.json({ error: 'Failed to get payment providers' }, { status: 500 });
    }
}
