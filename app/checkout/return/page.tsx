import { Suspense } from 'react';
import { CheckoutReturnClient } from './CheckoutReturnClient';

export default function CheckoutReturnPage() {
  // `useSearchParams()` is used inside the client component; wrap in Suspense
  // to satisfy Next.js static pre-render requirements.
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CheckoutReturnClient />
    </Suspense>
  );
}
