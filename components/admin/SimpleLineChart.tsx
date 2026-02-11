"use client";
import { asRecord } from '../../lib/runtime-guards';

interface SimpleLineChartProps {
  data: Array<{ date: string; value: number }>;
  stackedData?: Array<{ date: string; value: number }>;
  title: string;
  color?: string;
  stackedColor?: string;
  stackedLabel?: string;
  formatValue?: (value: number) => string;
  formatStackedValue?: (value: number) => string;
}

export default function SimpleLineChart({
  data,
  stackedData,
  title,
  color = '#3b82f6',
  stackedColor = '#10b981',
  stackedLabel = 'Stacked',
  formatValue = (value: number) => value.toString(),
  formatStackedValue
}: SimpleLineChartProps) {
  // Hydration/format settings were used previously for tooltip formatting.
  // The chart now uses an explicit Intl formatter for tooltip dates and
  // doesn't rely on the global format settings, so we don't need the
  // settings or hydration bookkeeping here.

  // Normalize incoming data to a consistent shape and filter bad values
  const mapSeries = (series: Array<{ date: string; value: number }> | undefined | null) =>
    (series ?? [])
      .map((entry) => {
        const r = asRecord(entry) || {};
        const date = String(r.date ?? '');
        const value = Number(r.value ?? r.revenue ?? r.subscriptions ?? r.users ?? 0);
        return { date, value };
      })
      .filter((point) => point.date && Number.isFinite(point.value));

  const baseSeries = mapSeries(data);
  const supplementalSeries = mapSeries(stackedData);

  const allDates = new Set<string>();
  baseSeries.forEach((point) => allDates.add(point.date));
  supplementalSeries.forEach((point) => allDates.add(point.date));

  const sortedDates = Array.from(allDates).sort();
  const baseMap = new Map(baseSeries.map((point) => [point.date, point.value]));
  const stackedMap = new Map(supplementalSeries.map((point) => [point.date, point.value]));

  const points = sortedDates.map((date) => ({
    date,
    base: baseMap.get(date) ?? 0,
    stacked: stackedMap.get(date)
  }));

  if (points.length === 0) {
    return (
      <div className="p-4 text-center text-neutral-500">
        No data available for {title}
      </div>
    );
  }

  const effectiveStackedFormatter = formatStackedValue ?? formatValue;

  // Tooltip date formatter (explicit, ignores user display settings)
  const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const totals = points.map((point) => {
    const baseValue = point.base;
    const stackedRaw = point.stacked ?? null;
    const extra = stackedRaw === null ? 0 : Math.max(0, stackedRaw - baseValue);
    return baseValue + extra;
  });

  const baseValues = points.map((point) => point.base);

  let maxValue = Math.max(...totals, 0);
  let minValue = Math.min(...baseValues, 0);
  if (!Number.isFinite(maxValue)) maxValue = 0;
  if (!Number.isFinite(minValue)) minValue = 0;
  const range = maxValue - minValue || 1;

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">{title}</h4>
      <div className="relative h-64 bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3">
        {/* left-side tick labels (aligned with the grid lines) */}
        {[0, 1, 2, 3, 4].map((i) => {
          // place labels approximately above each horizontal grid line
          const rawValue = maxValue - (i * (maxValue - minValue)) / 4;
          const intValue = Math.round(rawValue);
          const topPercent = `${i * 25}%`;
          return (
            <div
              key={`tick-${i}`}
              className="absolute left-2 text-[11px] leading-none text-neutral-500 dark:text-neutral-400"
              style={{ top: topPercent, transform: 'translateY(-70%)' }}
            >
              {formatValue(intValue)}
            </div>
          );
        })}
        <svg
          width="100%"
          height="100%"
          // Use points.length units so bars scale to fill available width
          viewBox={`0 0 ${Math.max(points.length, 1)} 160`}
          className="overflow-visible"
          // Allow horizontal stretching so the bars fill the container
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1="0"
              y1={i * 40}
              x2={Math.max(points.length, 1)}
              y2={i * 40}
              stroke="#e5e7eb"
              strokeWidth="0.5"
              className="dark:stroke-neutral-600"
            />
          ))}

          {/* Bars */}
          {points.map((point, index) => {
            const gap = 0.08; // fraction gap between bars
            const barWidth = 1 - gap; // width in viewBox units
            const x = index + gap / 2; // position in viewBox units
            const baseValue = Number(point.base);
            const stackedRaw = point.stacked ?? null;
            const extra = stackedRaw === null ? 0 : Math.max(0, stackedRaw - baseValue);

            const baseRatio = (baseValue - minValue) / range;
            const baseHeight = baseRatio * 160;
            const baseY = 160 - baseHeight;

            const totalValue = baseValue + extra;
            const totalRatio = (totalValue - minValue) / range;
            const totalHeight = totalRatio * 160;
            const stackedHeight = totalHeight - baseHeight;
            const stackedY = 160 - totalHeight;

            return (
              <g key={index}>
                <rect
                  x={x}
                  y={baseY}
                  width={barWidth}
                  height={baseHeight}
                  fill={color}
                  className="cursor-pointer"
                  style={{ filter: 'brightness(100%)' }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.filter = 'brightness(110%)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.filter = 'brightness(100%)';
                  }}
                />
                {stackedRaw !== null && stackedHeight > 0 ? (
                  <rect
                    x={x}
                    y={stackedY}
                    width={barWidth}
                    height={stackedHeight}
                    fill={stackedColor}
                    className="cursor-pointer"
                  />
                ) : null}
                <title>
                  {(() => {
                    const dateLabel = tooltipDateFormatter.format(new Date(point.date));
                    // Show Views first then Visits per requested order
                    const sections = [] as string[];
                    if (stackedRaw !== null) {
                      sections.push(`${stackedLabel}: ${effectiveStackedFormatter(stackedRaw)}`);
                    }
                    sections.push(`Visits: ${formatValue(baseValue)}`);
                    return `${dateLabel}\n${sections.join('\n')}`;
                  })()}
                </title>
              </g>
            );
          })}
        </svg>

        {/* Value labels */}
        <div className="absolute top-0 right-0 text-xs text-neutral-500">
          {formatValue(maxValue)}
        </div>
        <div className="absolute bottom-0 right-0 text-xs text-neutral-500">
          {formatValue(minValue)}
        </div>
      </div>
      
      {/* Latest values */}
      <div className="flex justify-between text-sm">
        {(() => {
          const latest = points[points.length - 1];
          const parts = [`Latest: ${formatValue(latest?.base ?? 0)}`];
          if (latest?.stacked != null) {
            parts.push(`${stackedLabel}: ${effectiveStackedFormatter(latest.stacked)}`);
          }
          return (
            <span className="text-neutral-600 dark:text-neutral-400">
              {parts.join(' · ')}
            </span>
          );
        })()}
        <span className="text-neutral-600 dark:text-neutral-400">
          {points.length} data points
        </span>
      </div>
    </div>
  );
}

