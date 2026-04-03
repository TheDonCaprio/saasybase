"use client";

interface PricingPageClientProps {
  children: React.ReactNode;
}

export function PricingPageClient({ children }: PricingPageClientProps) {
  return (
    <>
      <div>{children}</div>
    </>
  );
}
