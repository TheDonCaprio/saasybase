"use client";

import { useState } from 'react';
import { CouponRedeemModal } from './CouponRedeemModal';

interface PricingPageClientProps {
  children: React.ReactNode;
}

export function PricingPageClient({ children }: PricingPageClientProps) {
  const [showCouponModal, setShowCouponModal] = useState(false);

  return (
    <>
      <div
        onClick={(e) => {
          // Check if a link with href="/dashboard/coupons" was clicked
          if (e.target instanceof HTMLAnchorElement && e.target.href.includes('/dashboard/coupons')) {
            e.preventDefault();
            setShowCouponModal(true);
          }
        }}
      >
        {children}
      </div>
      <CouponRedeemModal isOpen={showCouponModal} onClose={() => setShowCouponModal(false)} />
    </>
  );
}
