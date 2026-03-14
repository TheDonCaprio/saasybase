import { describe, it, expect } from 'vitest';

import { extractRazorpayOfferId } from '../lib/coupons';

type CouponDescription = Parameters<typeof extractRazorpayOfferId>[0];

function couponWithDescription(description: string | null): CouponDescription {
  return { description };
}

describe('extractRazorpayOfferId', () => {
  it('returns null when description is empty', () => {
    expect(extractRazorpayOfferId(couponWithDescription(null))).toBeNull();
    expect(extractRazorpayOfferId(couponWithDescription(''))).toBeNull();
  });

  it('extracts offer id from supported patterns', () => {
    expect(extractRazorpayOfferId(couponWithDescription('razorpayOfferId=offer_ABC123'))).toBe('offer_ABC123');
    expect(extractRazorpayOfferId(couponWithDescription('razorpay_offer: offer_xyz789'))).toBe('offer_xyz789');
    expect(extractRazorpayOfferId(couponWithDescription('rzp_offer=offer_123'))).toBe('offer_123');
  });

  it('ignores non-offer tokens', () => {
    expect(extractRazorpayOfferId(couponWithDescription('razorpayOfferId=not_an_offer'))).toBeNull();
  });
});
