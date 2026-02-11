import clsx from 'clsx';
import { ReactNode } from 'react';

interface CouponBadgeProps {
  code?: string | null;
  className?: string;
  prefix?: string | null;
  children?: ReactNode;
}

export function CouponBadge({ code, className, prefix, children }: CouponBadgeProps) {
  const trimmed = code?.trim();
  if (!trimmed && !children) return null;

  const normalizedPrefix = prefix?.trim();

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-tight whitespace-nowrap',
        'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]',
        className
      )}
      style={{
        color: 'rgb(var(--accent-primary))',
        borderColor: 'rgb(var(--accent-primary) / 0.35)',
        backgroundColor: 'rgb(var(--accent-primary) / 0.12)',
      }}
    >
      {children ?? (
        <>
          {normalizedPrefix ? <span>{normalizedPrefix}</span> : null}
          {trimmed ? (
            <span className="font-mono text-[10px] tracking-widest">
              {trimmed.toUpperCase()}
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}
