import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import clsx from 'clsx';
import { dashboardCardClass } from '../dashboard/dashboardSurfaces';

export type AdminStatAccent = 'theme' | 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';

export interface AdminStatCardProps {
  label: string;
  value: string;
  helper?: string;
  footer?: string;
  icon?: IconDefinition;
  accent?: AdminStatAccent;
  size?: 'default' | 'compact';
  className?: string;
}

const accentMap: Record<AdminStatAccent, {
  border: string;
  gradient: string;
  icon: string;
  overlay: string;
}> = {
  theme: {
    border: 'border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.70))]',
    gradient: 'bg-[linear-gradient(135deg,rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.78)),rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.78))),linear-gradient(135deg,var(--theme-card-gradient-from),var(--theme-card-gradient-via),var(--theme-card-gradient-to))] dark:bg-[linear-gradient(135deg,rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.58)),rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.58))),linear-gradient(135deg,var(--theme-card-gradient-from),var(--theme-card-gradient-via),var(--theme-card-gradient-to))]',
    icon: 'bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.15))] text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]',
    overlay: 'bg-[radial-gradient(circle_at_top,_transparent,_transparent)]'
  },
  indigo: {
    border: 'border-indigo-200/70 dark:border-indigo-500/40',
    gradient: 'bg-gradient-to-br from-indigo-50 via-white to-white dark:from-indigo-500/10 dark:via-neutral-900/60 dark:to-transparent',
    icon: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-200',
    overlay: 'bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.32),_transparent_60%)]'
  },
  violet: {
    border: 'border-purple-200/70 dark:border-purple-500/40',
    gradient: 'bg-gradient-to-br from-purple-50 via-white to-white dark:from-purple-500/10 dark:via-neutral-900/60 dark:to-transparent',
    icon: 'bg-purple-500/15 text-purple-600 dark:text-purple-200',
    overlay: 'bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.2),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.32),_transparent_60%)]'
  },
  emerald: {
    border: 'border-emerald-200/70 dark:border-emerald-500/40',
    gradient: 'bg-gradient-to-br from-emerald-50 via-white to-white dark:from-emerald-500/10 dark:via-neutral-900/60 dark:to-transparent',
    icon: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-200',
    overlay: 'bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.32),_transparent_60%)]'
  },
  amber: {
    border: 'border-amber-200/70 dark:border-amber-500/40',
    gradient: 'bg-gradient-to-br from-amber-50 via-white to-white dark:from-amber-500/10 dark:via-neutral-900/60 dark:to-transparent',
    icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-200',
    overlay: 'bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.22),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.34),_transparent_60%)]'
  },
  rose: {
    border: 'border-rose-200/70 dark:border-rose-500/40',
    gradient: 'bg-gradient-to-br from-rose-50 via-white to-white dark:from-rose-500/10 dark:via-neutral-900/60 dark:to-transparent',
    icon: 'bg-rose-500/15 text-rose-600 dark:text-rose-200',
    overlay: 'bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.15),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.18),_transparent_60%)]'
  }
};

export function AdminStatCard({ label, value, helper, footer, icon, accent = 'theme', size = 'default', className }: AdminStatCardProps) {
  const palette = accentMap[accent];
  const isCompact = size === 'compact';
  const themeEdgeStyle = accent === 'theme'
    ? {
        borderTopWidth: 'var(--theme-stat-card-accent-top)',
        borderTopColor: 'rgb(var(--accent-primary-rgb) / calc(var(--accent-primary-a) * 0.92))',
      }
    : undefined;
  const labelClass = isCompact
    ? 'text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400'
    : 'text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400';
  const valueClass = isCompact
    ? 'mt-1 text-base font-semibold text-slate-900 dark:text-neutral-50'
    : 'mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-50';
  const helperClass = isCompact
    ? 'mt-1 text-[11px] text-slate-500 dark:text-neutral-400'
    : 'mt-1 text-xs text-slate-500 dark:text-neutral-400';
  const iconWrapClass = isCompact ? 'hidden sm:flex h-7 w-7 items-center justify-center rounded-full' : 'hidden sm:flex h-8 w-8 items-center justify-center rounded-full';
  const iconClass = isCompact ? 'h-3 w-3' : 'h-3 w-3';

  return (
    <div
      className={dashboardCardClass(
        clsx(
          'relative overflow-hidden h-full flex flex-col justify-between',
          isCompact ? 'p-3' : 'p-4',
          palette.border,
          palette.gradient,
          className
        )
      )}
      style={themeEdgeStyle}
    >
      {accent === 'theme' ? (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-[1]"
            style={{
              width: 'var(--theme-stat-card-accent-left)',
              backgroundColor: 'rgb(var(--accent-primary-rgb) / calc(var(--accent-primary-a) * 0.92))',
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1]"
            style={{
              height: 'var(--theme-stat-card-accent-top)',
              backgroundColor: 'rgb(var(--accent-primary-rgb) / calc(var(--accent-primary-a) * 0.92))',
            }}
          />
        </>
      ) : null}
      <div className={clsx('pointer-events-none absolute inset-0 z-0 opacity-75', palette.overlay)} />
      <div className="relative z-[2] flex items-start justify-between gap-2">
        <div>
          <p className={labelClass}>{label}</p>
          <p className={valueClass}>{value}</p>
          {helper ? <p className={helperClass}>{helper}</p> : null}
        </div>
        {icon ? (
          <span className={clsx(iconWrapClass, palette.icon)}>
            <FontAwesomeIcon icon={icon} className={iconClass} />
          </span>
        ) : null}
      </div>

      {footer ? (
        <div className="relative z-[2] pt-2">
          <p className="text-xs text-slate-500 dark:text-neutral-400">{footer}</p>
        </div>
      ) : null}
    </div>
  );
}
