import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { paymentService } from '../../../../../lib/payment/service';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';
import { StandardizedCheckoutSession } from '../../../../../lib/payment/types';
import { withRateLimit } from '../../../../../lib/rateLimit';
import { getRequestIp } from '../../../../../lib/request-ip';

function jsonError(message: string, status: number, code: string) {
    return NextResponse.json({ error: message, code }, { status });
}

const rateLimited = withRateLimit(
    async (req) => {
        const session = await auth();
        return session.userId
            ? `checkout-embedded-confirm:user:${session.userId}`
            : `checkout-embedded-confirm:ip:${getRequestIp(req) ?? 'unknown'}`;
    },
    {
        limit: 30,
        windowMs: 60 * 1000,
        message: 'Too many checkout confirmation requests',
        skipOnError: true,
    },
);

export async function GET(req: NextRequest) {
    return rateLimited(req, async () => {
        // Support both Stripe (payment_intent) and Paystack (reference/trxref) params
        // Paystack appends reference & trxref to the callback URL
        const paymentIntentId = req.nextUrl.searchParams.get('payment_intent');
        const paystackReference = req.nextUrl.searchParams.get('reference') || req.nextUrl.searchParams.get('trxref');
        const providerParam = req.nextUrl.searchParams.get('provider');
        const redirectStatus = req.nextUrl.searchParams.get('redirect_status');

        // Determine which reference to use based on provider
        const isPaystack = providerParam === 'paystack' || (!paymentIntentId && paystackReference);
        const referenceId = isPaystack ? (paystackReference || paymentIntentId) : paymentIntentId;

        if (!referenceId) {
            return jsonError('Missing payment reference', 400, 'CHECKOUT_REFERENCE_MISSING');
        }

        if (redirectStatus === 'failed') {
            return jsonError('Payment failed', 400, 'PAYMENT_FAILED');
        }

        const { userId } = await auth();
        if (!userId) {
            return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
        }

        try {
            // Use provider-agnostic method to retrieve payment intent / transaction
            const provider = paymentService.provider;

            Logger.info('Confirm checkout', { referenceId, isPaystack, provider: provider.name });

            const pi = await provider.getPaymentIntent(referenceId);

            if (pi.status !== 'succeeded' && pi.status !== 'processing') {
                // It might be processing if using async payment methods
                // If requires_payment_method, it failed or was cancelled
                if (pi.status === 'requires_payment_method') {
                    return jsonError('Payment failed or cancelled', 400, 'PAYMENT_FAILED');
                }
            }

            // Construct standardized session from payment intent
            const session: StandardizedCheckoutSession = {
                id: pi.id, // Use PI ID as session ID
                userId: pi.metadata?.userId || userId,
                userEmail: undefined, // We might not have it easily
                mode: pi.subscriptionId ? 'subscription' : 'payment',
                paymentStatus: pi.status === 'succeeded' ? 'paid' : 'unpaid',
                amountTotal: pi.amount,
                currency: pi.currency,
                metadata: pi.metadata,
                paymentIntentId: pi.id,
                subscriptionId: pi.subscriptionId,
            };

            const event = {
                type: 'checkout.completed',
                payload: session,
                originalEvent: pi,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await paymentService.processWebhookEvent(event as any);

            return NextResponse.json({
                ok: true,
                active: true, // simplified
                plan: 'Pro', // simplified, ideally we fetch the plan name
                purchasedPlan: 'Pro',
            });
        } catch (err) {
            const error = toError(err);
            Logger.error('Elements confirm error', { error: error.message });
            return jsonError(error.message || 'Failed to confirm payment', 500, 'CHECKOUT_CONFIRM_FAILED');
        }
    });
}
