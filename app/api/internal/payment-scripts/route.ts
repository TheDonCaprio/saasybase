import { NextResponse } from 'next/server';
import { PAYMENT_PROVIDERS, getActivePaymentProvider } from '@/lib/payment/provider-config';

/**
 * Returns the required client-side scripts for the active payment provider.
 * Used by PaymentProviderScripts component to dynamically load scripts.
 */
export async function GET() {
    const activeProvider = getActivePaymentProvider();
    const config = PAYMENT_PROVIDERS[activeProvider];

    if (!config) {
        return NextResponse.json({ scripts: [] });
    }

    return NextResponse.json({
        provider: activeProvider,
        scripts: config.scripts || []
    });
}
