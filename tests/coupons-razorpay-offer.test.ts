import { describe, it, expect } from 'vitest';

import { extractRazorpayOfferId } from '../lib/coupons';

describe('extractRazorpayOfferId', () => {
  it('returns null when description is empty', () => {
    expect(extractRazorpayOfferId({ description: null } as any)).toBeNull();
    expect(extractRazorpayOfferId({ description: '' } as any)).toBeNull();
  });

  it('extracts offer id from supported patterns', () => {
    expect(extractRazorpayOfferId({ description: 'razorpayOfferId=offer_ABC123' } as any)).toBe('offer_ABC123');
    expect(extractRazorpayOfferId({ description: 'razorpay_offer: offer_xyz789' } as any)).toBe('offer_xyz789');
    expect(extractRazorpayOfferId({ description: 'rzp_offer=offer_123' } as any)).toBe('offer_123');
  });

  it('ignores non-offer tokens', () => {
    expect(extractRazorpayOfferId({ description: 'razorpayOfferId=not_an_offer' } as any)).toBeNull();
  });
});
