"use client";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faTable, faTableCells } from '@fortawesome/free-solid-svg-icons';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ColorPickerWithAlpha } from '../ColorPickerWithAlpha';
import { getHexAlpha01 } from '../colorUtils';
import type { ColorTokens } from '../colorPaletteData';

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

export function LayoutTabContent({
  headerStyle,
  setHeaderStyle,
  headerHeight,
  setHeaderHeight,
  headerStickyEnabled,
  setHeaderStickyEnabled,
  headerStickyScrollY,
  setHeaderStickyScrollY,
  headerStickyHeight,
  setHeaderStickyHeight,
  lightColors,
  setLightColors,
  darkColors,
  setDarkColors,
  pricingMaxColumns,
  setPricingMaxColumns,
  pricingCenterUneven,
  setPricingCenterUneven,
}: {
  headerStyle: 'right' | 'left-nav' | 'center-nav';
  setHeaderStyle: (value: 'right' | 'left-nav' | 'center-nav') => void;
  headerHeight: number;
  setHeaderHeight: (value: number) => void;
  headerStickyEnabled: boolean;
  setHeaderStickyEnabled: (value: boolean) => void;
  headerStickyScrollY: number;
  setHeaderStickyScrollY: (value: number) => void;
  headerStickyHeight: number;
  setHeaderStickyHeight: (value: number) => void;
  lightColors: ColorTokens;
  setLightColors: (value: ColorTokens) => void;
  darkColors: ColorTokens;
  setDarkColors: (value: ColorTokens) => void;
  pricingMaxColumns: number;
  setPricingMaxColumns: (value: number) => void;
  pricingCenterUneven: boolean;
  setPricingCenterUneven: (value: boolean) => void;
}) {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-6">
          <FontAwesomeIcon icon={faTableCells} className="h-5 w-5" />
          Header Layout
        </div>
        <p className="text-sm text-slate-600 dark:text-neutral-300 mb-6">Adjust how the header is positioned and how it behaves when scrolling.</p>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="text-sm font-medium text-slate-900 dark:text-neutral-100">Header style</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                { id: 'right' as const, label: 'Right cluster', hint: 'Logo left, links + actions right' },
                { id: 'center-nav' as const, label: 'Centered links', hint: 'Logo left, links centered' },
                { id: 'left-nav' as const, label: 'Left links', hint: 'Logo + links left' },
              ]).map((opt) => {
                const selected = headerStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setHeaderStyle(opt.id)}
                    aria-pressed={selected}
                    className={cx(
                      'rounded-xl border p-3 text-left transition-colors',
                      selected
                        ? 'border-slate-400 bg-white dark:border-neutral-600 dark:bg-neutral-900'
                        : 'border-slate-200 bg-slate-50 hover:bg-white dark:border-neutral-800 dark:bg-neutral-900/50 dark:hover:bg-neutral-900'
                    )}
                  >
                    <div className="mb-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 px-2 dark:border-neutral-800 dark:bg-neutral-900">
                        {opt.id === 'right' ? (
                          <div className="flex h-full items-center justify-between">
                            <div className="h-2 w-6 rounded bg-slate-300 dark:bg-neutral-700" />
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-10 rounded bg-slate-200 dark:bg-neutral-800" />
                              <div className="h-2 w-5 rounded bg-slate-300 dark:bg-neutral-700" />
                            </div>
                          </div>
                        ) : opt.id === 'center-nav' ? (
                          <div className="flex h-full items-center">
                            <div className="h-2 w-6 rounded bg-slate-300 dark:bg-neutral-700" />
                            <div className="flex-1 flex items-center justify-center">
                              <div className="h-2 w-12 rounded bg-slate-200 dark:bg-neutral-800" />
                            </div>
                            <div className="h-2 w-5 rounded bg-slate-300 dark:bg-neutral-700" />
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-between">
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-6 rounded bg-slate-300 dark:bg-neutral-700" />
                              <div className="h-2 w-10 rounded bg-slate-200 dark:bg-neutral-800" />
                            </div>
                            <div className="h-2 w-5 rounded bg-slate-300 dark:bg-neutral-700" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{opt.label}</div>
                    <div className="text-xs text-slate-500 dark:text-neutral-400">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="header-height" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
                  Header height (px)
                </label>
                <input
                  id="header-height"
                  type="number"
                  min={48}
                  max={160}
                  value={headerHeight}
                  onChange={(e) => setHeaderHeight(parseInt(e.target.value || '0', 10) || 0)}
                  onBlur={() => {
                    const n = Number.isFinite(headerHeight) ? headerHeight : 80;
                    const clamped = Math.max(48, Math.min(160, Math.round(n || 80)));
                    if (clamped !== headerHeight) setHeaderHeight(clamped);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-500">Applies to the normal (non-sticky) header.</p>
              </div>
              <div className="space-y-2">
                <div className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Sticky header</div>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-100">
                  <input
                    type="checkbox"
                    checked={headerStickyEnabled}
                    onChange={(e) => setHeaderStickyEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Enable sticky header
                </label>
                <p className="text-xs text-slate-500 dark:text-neutral-500">When enabled, the header becomes fixed after the scroll point.</p>
              </div>
            </div>

            <div className={cx('grid gap-4 sm:grid-cols-2', !headerStickyEnabled && 'opacity-60')}>
              <div className="space-y-2">
                <label htmlFor="header-sticky-scroll" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
                  Scroll point (px)
                </label>
                <input
                  id="header-sticky-scroll"
                  type="number"
                  min={0}
                  max={2000}
                  disabled={!headerStickyEnabled}
                  value={headerStickyScrollY}
                  onChange={(e) => setHeaderStickyScrollY(parseInt(e.target.value || '0', 10) || 0)}
                  onBlur={() => {
                    const n = Number.isFinite(headerStickyScrollY) ? headerStickyScrollY : 120;
                    const clamped = Math.max(0, Math.min(2000, Math.round(n || 0)));
                    if (clamped !== headerStickyScrollY) setHeaderStickyScrollY(clamped);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-500">Distance from the top before stickiness activates.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="header-sticky-height" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
                  Sticky height (px)
                </label>
                <input
                  id="header-sticky-height"
                  type="number"
                  min={40}
                  max={160}
                  disabled={!headerStickyEnabled}
                  value={headerStickyHeight}
                  onChange={(e) => setHeaderStickyHeight(parseInt(e.target.value || '0', 10) || 0)}
                  onBlur={() => {
                    const n = Number.isFinite(headerStickyHeight) ? headerStickyHeight : 64;
                    const clamped = Math.max(40, Math.min(160, Math.round(n || 64)));
                    if (clamped !== headerStickyHeight) setHeaderStickyHeight(clamped);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-500">Height of the header while sticky.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-6">
          <FontAwesomeIcon icon={faPalette} className="h-5 w-5" />
          Sticky header colors
        </div>
        <p className="text-sm text-slate-600 dark:text-neutral-300 mb-6">Configure background, transparency, blur, shadow, and text color while the header is sticky.</p>

        <div className={cx('space-y-4', !headerStickyEnabled && 'opacity-60')}>
          <div className="grid gap-4 lg:grid-cols-2">
            {([
              { title: 'Light mode', mode: 'light' as const, value: lightColors, setValue: setLightColors },
              { title: 'Dark mode', mode: 'dark' as const, value: darkColors, setValue: setDarkColors },
            ]).map(({ title, mode, value, setValue }) => {
              const updateHex = (
                key: 'stickyHeaderBg' | 'stickyHeaderText' | 'stickyHeaderBorder' | 'stickyHeaderShadow',
                hex: string,
              ) => {
                setValue({ ...value, [key]: hex });
              };

              const updateBlur = (px: number) => {
                const clamped = Math.max(0, Math.min(40, Math.round(px)));
                setValue({ ...value, stickyHeaderBlur: clamped });
              };

              const updateBorderWidth = (px: number) => {
                const clamped = Math.max(0, Math.min(4, Math.round(px)));
                setValue({ ...value, stickyHeaderBorderWidth: clamped });
              };

              const updateShadowBlur = (px: number) => {
                const clamped = Math.max(0, Math.min(80, Math.round(px)));
                setValue({ ...value, stickyHeaderShadowBlur: clamped });
              };

              const updateShadowSpread = (px: number) => {
                const clamped = Math.max(-80, Math.min(80, Math.round(px)));
                setValue({ ...value, stickyHeaderShadowSpread: clamped });
              };

              return (
                <div
                  key={`sticky-colors-${mode}`}
                  className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{title}</div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <span className="text-sm text-slate-700 dark:text-neutral-300">
                        Background
                        <span className="ml-2 text-xs text-slate-500 dark:text-neutral-400">
                          ({Math.round(getHexAlpha01(value.stickyHeaderBg) * 100)}%)
                        </span>
                      </span>
                      <ColorPickerWithAlpha
                        value={value.stickyHeaderBg}
                        onChange={(hex) => updateHex('stickyHeaderBg', hex)}
                        disabled={!headerStickyEnabled}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <span className="text-sm text-slate-700 dark:text-neutral-300">Text</span>
                      <ColorPickerWithAlpha
                        value={value.stickyHeaderText}
                        onChange={(hex) => updateHex('stickyHeaderText', hex)}
                        disabled={!headerStickyEnabled}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <span className="text-sm text-slate-700 dark:text-neutral-300">
                        Border (bottom)
                        <span className="ml-2 text-xs text-slate-500 dark:text-neutral-400">
                          ({Math.round(getHexAlpha01(value.stickyHeaderBorder) * 100)}%)
                        </span>
                      </span>
                      <ColorPickerWithAlpha
                        value={value.stickyHeaderBorder}
                        onChange={(hex) => updateHex('stickyHeaderBorder', hex)}
                        disabled={!headerStickyEnabled}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <span className="text-sm text-slate-700 dark:text-neutral-300">
                        Drop shadow
                        <span className="ml-2 text-xs text-slate-500 dark:text-neutral-400">
                          ({Math.round(getHexAlpha01(value.stickyHeaderShadow) * 100)}%)
                        </span>
                      </span>
                      <ColorPickerWithAlpha
                        value={value.stickyHeaderShadow}
                        onChange={(hex) => updateHex('stickyHeaderShadow', hex)}
                        disabled={!headerStickyEnabled}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Shadow blur (px)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={80}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(
                            0,
                            Math.min(80, Math.round(Number.isFinite(value.stickyHeaderShadowBlur) ? value.stickyHeaderShadowBlur : 30))
                          )}
                          onChange={(e) => updateShadowBlur(Number(e.target.value))}
                          className="h-2 w-full flex-1 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <input
                          type="number"
                          min={0}
                          max={80}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(
                            0,
                            Math.min(80, Math.round(Number.isFinite(value.stickyHeaderShadowBlur) ? value.stickyHeaderShadowBlur : 30))
                          )}
                          onChange={(e) => updateShadowBlur(Number(e.target.value))}
                          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          aria-label="Sticky header shadow blur pixels"
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">0–80px</p>
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Shadow spread (px)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={-80}
                          max={80}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(
                            -80,
                            Math.min(80, Math.round(Number.isFinite(value.stickyHeaderShadowSpread) ? value.stickyHeaderShadowSpread : -22))
                          )}
                          onChange={(e) => updateShadowSpread(Number(e.target.value))}
                          className="h-2 w-full flex-1 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <input
                          type="number"
                          min={-80}
                          max={80}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(
                            -80,
                            Math.min(80, Math.round(Number.isFinite(value.stickyHeaderShadowSpread) ? value.stickyHeaderShadowSpread : -22))
                          )}
                          onChange={(e) => updateShadowSpread(Number(e.target.value))}
                          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          aria-label="Sticky header shadow spread pixels"
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">-80–80px</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Blur (px)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={40}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(0, Math.min(40, Math.round(Number.isFinite(value.stickyHeaderBlur) ? value.stickyHeaderBlur : 0)))}
                          onChange={(e) => updateBlur(Number(e.target.value))}
                          className="h-2 w-full flex-1 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <input
                          type="number"
                          min={0}
                          max={40}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(0, Math.min(40, Math.round(Number.isFinite(value.stickyHeaderBlur) ? value.stickyHeaderBlur : 0)))}
                          onChange={(e) => updateBlur(Number(e.target.value))}
                          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          aria-label="Sticky header blur pixels"
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">0–40px</p>
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Border width (px)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={4}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(0, Math.min(4, Math.round(Number.isFinite(value.stickyHeaderBorderWidth) ? value.stickyHeaderBorderWidth : 1)))}
                          onChange={(e) => updateBorderWidth(Number(e.target.value))}
                          className="h-2 w-full flex-1 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <input
                          type="number"
                          min={0}
                          max={4}
                          step={1}
                          disabled={!headerStickyEnabled}
                          value={Math.max(0, Math.min(4, Math.round(Number.isFinite(value.stickyHeaderBorderWidth) ? value.stickyHeaderBorderWidth : 1)))}
                          onChange={(e) => updateBorderWidth(Number(e.target.value))}
                          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          aria-label="Sticky header border width pixels"
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">Set to 0 to disable.</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500 dark:text-neutral-500">These apply only while the header is sticky.</p>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-6">
          <FontAwesomeIcon icon={faTable} className="h-5 w-5" />
          Pricing Layout
        </div>
        <p className="text-sm text-slate-600 dark:text-neutral-300 mb-6">Control how pricing cards are displayed on pricing and dashboard pages.</p>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label htmlFor="pricing-max-columns" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
              Maximum columns
            </label>
            <select
              id="pricing-max-columns"
              value={pricingMaxColumns}
              onChange={(e) => setPricingMaxColumns(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value={0}>Unlimited (auto-fit responsive)</option>
              <option value={1}>1 column</option>
              <option value={2}>2 columns</option>
              <option value={3}>3 columns</option>
              <option value={4}>4 columns</option>
              <option value={5}>5 columns</option>
              <option value={6}>6 columns</option>
            </select>
            <p className="text-xs text-slate-500 dark:text-neutral-500">
              {pricingMaxColumns === 0
                ? 'Cards automatically fit available space with responsive breakpoints.'
                : `Cards will be arranged in up to ${pricingMaxColumns} column${pricingMaxColumns === 1 ? '' : 's'} maximum.`}
            </p>
          </div>
          <div className="space-y-3">
            <label htmlFor="pricing-center-uneven" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
              Center incomplete rows
            </label>
            <select
              id="pricing-center-uneven"
              value={pricingCenterUneven ? 'true' : 'false'}
              onChange={(e) => setPricingCenterUneven(e.target.value === 'true')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="false">Disabled (left-aligned)</option>
              <option value="true">Enabled (center incomplete rows)</option>
            </select>
            <p className="text-xs text-slate-500 dark:text-neutral-500">
              {pricingCenterUneven
                ? 'When there are fewer cards than max columns, they will be centered horizontally.'
                : 'Cards will always be left-aligned regardless of count.'}
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">
        Header, sidebar, page background gradient, and glow colors live under the{' '}
        <span className="font-semibold text-slate-900 dark:text-neutral-100">Colors</span> tab. Sticky header colors are configured above.
      </div>
    </div>
  );
}
