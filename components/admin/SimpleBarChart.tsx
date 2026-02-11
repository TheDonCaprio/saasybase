'use client';

import clsx from 'clsx';

interface SimpleBarChartDatum {
  label: string;
  value: number;
  helper?: string;
}

interface SimpleBarChartProps {
  title: string;
  data: SimpleBarChartDatum[];
  color?: string;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
}

export default function SimpleBarChart({
  title,
  data,
  color = '#6366f1',
  formatValue = (value: number) => value.toString(),
  emptyMessage = 'No data available.'
}: SimpleBarChartProps) {
  const safeData = Array.isArray(data) ? data.filter((item) => Number.isFinite(item.value) && item.value >= 0) : [];
  const maxValue = safeData.length > 0 ? Math.max(...safeData.map((item) => item.value)) : 0;

  if (safeData.length === 0 || maxValue === 0) {
    return (
      <div className="space-y-3">
        <h4 className="font-medium text-slate-900 dark:text-neutral-100">{title}</h4>
        <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h4 className="font-medium text-slate-900 dark:text-neutral-100">{title}</h4>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500">
          {safeData.length} entries
        </span>
      </div>
      <div className="space-y-3">
        {safeData.map((item) => {
          const width = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 2) : 0;
          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700 dark:text-neutral-200">{item.label}</span>
                <span className="text-slate-500 dark:text-neutral-300">{formatValue(item.value)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-700')}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${width}%`,
                      background: color,
                      opacity: 0.9
                    }}
                  />
                </div>
                {item.helper ? (
                  <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">{item.helper}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
