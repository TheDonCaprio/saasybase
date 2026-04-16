"use client";

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faFloppyDisk, faPaintBrush, faTrash } from '@fortawesome/free-solid-svg-icons';

import { ConfirmModal } from '../../../ui/ConfirmModal';
import { ColorPickerWithAlpha } from '../ColorPickerWithAlpha';
import { getHexAlpha01, hexToRgb } from '../colorUtils';
import {
  COLOR_GROUPS,
  COLOR_LABELS,
  DARK_PRESETS,
  DEFAULT_LIGHT_COLORS,
  fillElementGradients,
  LIGHT_PRESETS,
  type ColorHexKey,
  type ColorTokens,
  type ThemeColorPreset,
} from '../colorPaletteData';

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

export interface ColorTabContentProps {
  lightColors: ColorTokens;
  darkColors: ColorTokens;
  colorMode: 'light' | 'dark';
  onColorMode: (m: 'light' | 'dark') => void;
  onLightChange: (c: ColorTokens) => void;
  onDarkChange: (c: ColorTokens) => void;
  customPresets?: ThemeColorPreset[];
  onSavePreset?: (name: string, mode: 'light' | 'dark') => Promise<boolean>;
  onDeletePreset?: (name: string) => Promise<boolean>;
  onSelectDefaultPreset?: () => void;
}

export function ColorTabContent({
  lightColors,
  darkColors,
  colorMode,
  onColorMode,
  onLightChange,
  onDarkChange,
  customPresets = [],
  onSavePreset,
  onDeletePreset,
  onSelectDefaultPreset,
}: ColorTabContentProps) {
  const colors = colorMode === 'light' ? lightColors : darkColors;
  const builtInPresets = colorMode === 'light' ? LIGHT_PRESETS : DARK_PRESETS;
  const setColors = colorMode === 'light' ? onLightChange : onDarkChange;

  // Opacity for these tokens is encoded in the hex alpha channel (#RRGGBBAA).
  const showAlphaForKey = (key: ColorHexKey) => {
    return (
      key === 'headerBg' ||
      key === 'headerBorder' ||
      key === 'stickyHeaderBg' ||
      key === 'sidebarBg' ||
      key === 'sidebarBorder' ||
      key === 'headerShadow' ||
      key === 'panelShadow' ||
      key === 'cardShadow' ||
      key === 'tabsShadow' ||
      key === 'sidebarShadow' ||
      key === 'pageGlow'
    );
  };

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [savePresetLoading, setSavePresetLoading] = useState(false);

  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);
  const [deletePresetLoading, setDeletePresetLoading] = useState(false);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const custom = customPresets.map((preset) => {
    const modeColors = colorMode === 'light' ? preset.light : preset.dark;
    return {
      name: preset.name,
      accent: modeColors.accentPrimary,
      colors: fillElementGradients(modeColors),
      source: 'custom' as const,
    };
  });

  const presets = [
    ...builtInPresets.map((p) => ({ ...p, colors: fillElementGradients(p.colors), source: 'built-in' as const })),
    ...custom,
  ];

  const updateColor = (key: ColorHexKey, value: string) => {
    setColors({ ...colors, [key]: value });
  };

  const isPresetActive = (preset: ColorTokens) => {
    const ignoredKeys: Array<keyof ColorTokens> = [
      'headerOpacity',
      'sidebarOpacity',
      'glowOpacity',
      'headerBorderOpacity',
      'stickyHeaderOpacity',
      'stickyHeaderBorderOpacity',
    ];
    const keys = (Object.keys(DEFAULT_LIGHT_COLORS) as (keyof ColorTokens)[]).filter((key) => !ignoredKeys.includes(key));
    const normalizeComparableValue = (value: ColorTokens[keyof ColorTokens]) => {
      return typeof value === 'string' ? value.trim().toLowerCase() : value;
    };

    return keys.every((key) => normalizeComparableValue(colors[key]) === normalizeComparableValue(preset[key]));
  };

  const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
    const num = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  };
  const toMultipliedRgba = (hex: string, alphaMultiplier: number) => {
    const [red, green, blue] = hexToRgb(hex);
    const alpha = Math.max(0, Math.min(1, getHexAlpha01(hex) * alphaMultiplier));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };
  const surfaceRadius = clampInt(colors.surfaceRadius, 0, 32, 16);
  const statCardAccentTop = clampInt(colors.statCardAccentTop, 0, 8, 0);
  const statCardAccentLeft = clampInt(colors.statCardAccentLeft, 0, 8, 0);
  const statCardSurfaceWash = toMultipliedRgba(colors.bgSecondary, colorMode === 'dark' ? 0.58 : 0.78);
  const statCardBorderColor = toMultipliedRgba(colors.borderPrimary, 0.7);
  const statCardTopBorderColor = toMultipliedRgba(colors.accentPrimary, 0.92);

  return (
    <div className="space-y-8">
      {/* Save preset modal */}
      {saveModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[70000] flex min-h-screen items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-neutral-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-neutral-100">Save preset</h2>
                  <button
                    type="button"
                    onClick={() => {
                      if (savePresetLoading) return;
                      setSaveModalOpen(false);
                    }}
                    className="text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
                    aria-label="Close"
                    disabled={savePresetLoading}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-3 p-5">
                  <p className="text-sm text-slate-600 dark:text-neutral-300">
                    Saves the current {colorMode === 'light' ? 'light' : 'dark'} mode colors under this name.
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-neutral-200" htmlFor="save-preset-name">
                      Preset name
                    </label>
                    <input
                      id="save-preset-name"
                      value={savePresetName}
                      onChange={(e) => setSavePresetName(e.target.value)}
                      placeholder="e.g. Ocean"
                      maxLength={48}
                      disabled={savePresetLoading}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!onSavePreset) return;
                          const trimmed = savePresetName.trim();
                          if (!trimmed) return;
                          if (savePresetLoading) return;
                          setSavePresetLoading(true);
                          Promise.resolve(onSavePreset(trimmed, colorMode))
                            .then((ok) => {
                              if (ok) setSaveModalOpen(false);
                            })
                            .finally(() => setSavePresetLoading(false));
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          if (savePresetLoading) return;
                          setSaveModalOpen(false);
                        }
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div className="flex gap-3 p-5 pt-0">
                  <button
                    type="button"
                    onClick={() => setSaveModalOpen(false)}
                    disabled={savePresetLoading}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!onSavePreset) return;
                      const trimmed = savePresetName.trim();
                      if (!trimmed) return;
                      if (savePresetLoading) return;
                      setSavePresetLoading(true);
                      Promise.resolve(onSavePreset(trimmed, colorMode))
                        .then((ok) => {
                          if (ok) setSaveModalOpen(false);
                        })
                        .finally(() => setSavePresetLoading(false));
                    }}
                    disabled={savePresetLoading || !savePresetName.trim()}
                    className={cx(
                      'flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60',
                      savePresetLoading || !savePresetName.trim() ? 'bg-blue-600/60' : 'bg-blue-600 hover:bg-blue-700',
                    )}
                  >
                    {savePresetLoading ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Delete preset confirmation */}
      <ConfirmModal
        isOpen={!!pendingDeleteName}
        title="Delete preset"
        description={pendingDeleteName ? `Delete preset "${pendingDeleteName}"? This action cannot be undone.` : 'Delete this preset?'}
        confirmLabel={deletePresetLoading ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        loading={deletePresetLoading}
        onClose={() => {
          if (deletePresetLoading) return;
          setPendingDeleteName(null);
        }}
        onConfirm={() => {
          if (!onDeletePreset) return;
          if (!pendingDeleteName) return;
          if (deletePresetLoading) return;
          setDeletePresetLoading(true);
          Promise.resolve(onDeletePreset(pendingDeleteName))
            .then((ok) => {
              if (ok) setPendingDeleteName(null);
            })
            .finally(() => setDeletePresetLoading(false));
        }}
        confirmDisabled={!pendingDeleteName}
      />

      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={colorMode === m}
              onClick={() => onColorMode(m)}
              className={cx(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                colorMode === m
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-100',
              )}
            >
              {m === 'light' ? 'Light mode' : 'Dark mode'}
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <section>

        <div className="flex flex-wrap gap-3">
          {presets.map((preset) => {
            const active = isPresetActive(preset.colors);
            return (
              <div key={`${preset.source}-${preset.name}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setColors(preset.colors);
                    if (preset.source === 'built-in' && preset.name === 'Default') {
                      onSelectDefaultPreset?.();
                    }
                  }}
                  className={cx(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all',
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-inner dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
                  )}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: preset.accent }}
                  />
                  {preset.name}
                  {active && <span className="text-xs opacity-60">(active)</span>}
                </button>

                {preset.source === 'custom' && onDeletePreset ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingDeleteName(preset.name);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-neutral-100"
                    aria-label={`Delete preset ${preset.name}`}
                    title="Delete preset"
                  >
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Theme Editor toggle */}
      <div>
        <button
          type="button"
          onClick={() => {
            setThemeEditorOpen((prev) => {
              if (!prev) {
                requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }
              return !prev;
            });
          }}
          className={cx(
            'inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all',
            themeEditorOpen
              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-inner dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
          )}
        >
          <FontAwesomeIcon icon={faPaintBrush} className="h-3.5 w-3.5" />
          Theme Editor
          <FontAwesomeIcon
            icon={faChevronDown}
            className={cx('h-3 w-3 transition-transform', themeEditorOpen && 'rotate-180')}
          />
        </button>
      </div>

      {themeEditorOpen && (
      <div ref={editorRef} className="space-y-8">

      {/* Per-token pickers */}
      <section className="space-y-6">
        {COLOR_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">{group.title}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {group.keys.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <span className="text-sm text-slate-700 dark:text-neutral-300">
                    {COLOR_LABELS[key]}
                    {showAlphaForKey(key) ? (
                      <span className="ml-2 text-xs text-slate-500 dark:text-neutral-400">({Math.round(getHexAlpha01(colors[key]) * 100)}%)</span>
                    ) : null}
                  </span>
                  <ColorPickerWithAlpha value={colors[key]} onChange={(v) => updateColor(key, v)} label={undefined} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Header effects */}
      <section>
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">Header</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Header blur (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={clampInt(colors.headerBlur, 0, 40, 12)}
                onChange={(e) => setColors({ ...colors, headerBlur: clampInt(e.target.value, 0, 40, 12) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={40}
                step={1}
                value={clampInt(colors.headerBlur, 0, 40, 12)}
                onChange={(e) => setColors({ ...colors, headerBlur: clampInt(e.target.value, 0, 40, 12) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Header blur pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">0–40px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Header shadow blur (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.headerShadowBlur, 0, 80, 30)}
                onChange={(e) => setColors({ ...colors, headerShadowBlur: clampInt(e.target.value, 0, 80, 30) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.headerShadowBlur, 0, 80, 30)}
                onChange={(e) => setColors({ ...colors, headerShadowBlur: clampInt(e.target.value, 0, 80, 30) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Header shadow blur pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">0–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Header shadow spread (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.headerShadowSpread, -80, 80, -22)}
                onChange={(e) => setColors({ ...colors, headerShadowSpread: clampInt(e.target.value, -80, 80, -22) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.headerShadowSpread, -80, 80, -22)}
                onChange={(e) => setColors({ ...colors, headerShadowSpread: clampInt(e.target.value, -80, 80, -22) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Header shadow spread pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">-80–80px (negative makes it tighter)</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Header border width (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={4}
                step={1}
                value={clampInt(colors.headerBorderWidth, 0, 4, 1)}
                onChange={(e) => setColors({ ...colors, headerBorderWidth: clampInt(e.target.value, 0, 4, 1) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={4}
                step={1}
                value={clampInt(colors.headerBorderWidth, 0, 4, 1)}
                onChange={(e) => setColors({ ...colors, headerBorderWidth: clampInt(e.target.value, 0, 4, 1) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Header border width pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Set to 0 to disable.</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Header menu font size (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={20}
                step={1}
                value={clampInt(colors.headerMenuFontSize, 10, 20, 14)}
                onChange={(e) => setColors({ ...colors, headerMenuFontSize: clampInt(e.target.value, 10, 20, 14) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={10}
                max={20}
                step={1}
                value={clampInt(colors.headerMenuFontSize, 10, 20, 14)}
                onChange={(e) => setColors({ ...colors, headerMenuFontSize: clampInt(e.target.value, 10, 20, 14) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Header menu font size pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">10–20px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Header menu font weight</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={300}
                max={800}
                step={50}
                value={clampInt(colors.headerMenuFontWeight, 300, 800, 400)}
                onChange={(e) => setColors({ ...colors, headerMenuFontWeight: clampInt(e.target.value, 300, 800, 400) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={300}
                max={800}
                step={50}
                value={clampInt(colors.headerMenuFontWeight, 300, 800, 400)}
                onChange={(e) => setColors({ ...colors, headerMenuFontWeight: clampInt(e.target.value, 300, 800, 400) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Header menu font weight"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">300–800</p>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
          Header border color is under the <span className="font-semibold">Header</span> group above. Sticky header border color lives under the{' '}
          <span className="font-semibold">Layout</span> tab (including sticky border width).
        </p>
      </section>

      <section>
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">Surface elevation</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Panel shadow blur (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.panelShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))}
                onChange={(e) => setColors({ ...colors, panelShadowBlur: clampInt(e.target.value, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24)) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.panelShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))}
                onChange={(e) => setColors({ ...colors, panelShadowBlur: clampInt(e.target.value, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24)) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Panel shadow blur pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">0–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Panel shadow spread (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.panelShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))}
                onChange={(e) => setColors({ ...colors, panelShadowSpread: clampInt(e.target.value, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18)) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.panelShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))}
                onChange={(e) => setColors({ ...colors, panelShadowSpread: clampInt(e.target.value, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18)) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Panel shadow spread pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">-80–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Card shadow blur (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.cardShadowBlur, 0, 80, 24)}
                onChange={(e) => setColors({ ...colors, cardShadowBlur: clampInt(e.target.value, 0, 80, 24) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.cardShadowBlur, 0, 80, 24)}
                onChange={(e) => setColors({ ...colors, cardShadowBlur: clampInt(e.target.value, 0, 80, 24) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Card shadow blur pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">0–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Card shadow spread (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.cardShadowSpread, -80, 80, -18)}
                onChange={(e) => setColors({ ...colors, cardShadowSpread: clampInt(e.target.value, -80, 80, -18) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.cardShadowSpread, -80, 80, -18)}
                onChange={(e) => setColors({ ...colors, cardShadowSpread: clampInt(e.target.value, -80, 80, -18) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Card shadow spread pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">-80–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Tab strip shadow blur (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.tabsShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))}
                onChange={(e) => setColors({ ...colors, tabsShadowBlur: clampInt(e.target.value, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24)) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.tabsShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))}
                onChange={(e) => setColors({ ...colors, tabsShadowBlur: clampInt(e.target.value, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24)) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Tab strip shadow blur pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">0–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Tab strip shadow spread (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.tabsShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))}
                onChange={(e) => setColors({ ...colors, tabsShadowSpread: clampInt(e.target.value, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18)) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.tabsShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))}
                onChange={(e) => setColors({ ...colors, tabsShadowSpread: clampInt(e.target.value, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18)) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Tab strip shadow spread pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">-80–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Sidebar shadow blur (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.sidebarShadowBlur, 0, 80, clampInt(colors.panelShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24)))}
                onChange={(e) => setColors({ ...colors, sidebarShadowBlur: clampInt(e.target.value, 0, 80, clampInt(colors.panelShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={80}
                step={1}
                value={clampInt(colors.sidebarShadowBlur, 0, 80, clampInt(colors.panelShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24)))}
                onChange={(e) => setColors({ ...colors, sidebarShadowBlur: clampInt(e.target.value, 0, 80, clampInt(colors.panelShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Sidebar shadow blur pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">0–80px</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Sidebar shadow spread (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.sidebarShadowSpread, -80, 80, clampInt(colors.panelShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18)))}
                onChange={(e) => setColors({ ...colors, sidebarShadowSpread: clampInt(e.target.value, -80, 80, clampInt(colors.panelShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={-80}
                max={80}
                step={1}
                value={clampInt(colors.sidebarShadowSpread, -80, 80, clampInt(colors.panelShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18)))}
                onChange={(e) => setColors({ ...colors, sidebarShadowSpread: clampInt(e.target.value, -80, 80, clampInt(colors.panelShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Sidebar shadow spread pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">-80–80px</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">Structure</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Surface radius (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={32}
                step={1}
                value={surfaceRadius}
                onChange={(e) => setColors({ ...colors, surfaceRadius: clampInt(e.target.value, 0, 32, 16) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={32}
                step={1}
                value={surfaceRadius}
                onChange={(e) => setColors({ ...colors, surfaceRadius: clampInt(e.target.value, 0, 32, 16) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Surface radius pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Applies to shared cards, panels, settings shells, and themed pricing cards.</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Stat card accent top (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={statCardAccentTop}
                onChange={(e) => setColors({ ...colors, statCardAccentTop: clampInt(e.target.value, 0, 8, 0) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={8}
                step={1}
                value={statCardAccentTop}
                onChange={(e) => setColors({ ...colors, statCardAccentTop: clampInt(e.target.value, 0, 8, 0) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Stat card accent top pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Adds a theme-accent top edge to theme stat cards. Set to 0 to disable it.</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Stat card accent left (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={statCardAccentLeft}
                onChange={(e) => setColors({ ...colors, statCardAccentLeft: clampInt(e.target.value, 0, 8, 0) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={8}
                step={1}
                value={statCardAccentLeft}
                onChange={(e) => setColors({ ...colors, statCardAccentLeft: clampInt(e.target.value, 0, 8, 0) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Stat card accent left pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Adds a theme-accent left edge to theme stat cards. Set to 0 to disable it.</p>
          </div>
        </div>
      </section>

      {onSavePreset ? (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => {
              setSavePresetName('');
              setSaveModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <FontAwesomeIcon icon={faFloppyDisk} className="h-3.5 w-3.5" />
            Save current as preset
          </button>
        </div>
      ) : null}

      </div>
      )}

      {/* Live preview */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Live preview</div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
            {colorMode} mode
          </span>
        </div>

        {/* Browser chrome */}
        <div
          className="relative overflow-hidden rounded-2xl border shadow-lg"
          style={{
            borderColor: colors.borderPrimary,
            backgroundColor: colors.bgPrimary,
            borderRadius: `${surfaceRadius}px`,
            // Make native inputs inside the preview follow the preview mode, not the page's current mode.
            colorScheme: colorMode,
            // Two-layer background: glow radiates from above the frame (negative Y), then page gradient below
            backgroundImage: [
              `radial-gradient(ellipse 70% 45% at 50% -15%, ${colors.pageGlow}, transparent 70%)`,
              `linear-gradient(to bottom, ${colors.pageGradientFrom}, ${colors.pageGradientVia}, ${colors.pageGradientTo})`,
            ].join(', '),
          }}
        >

          {/* ── Normal header ── */}
          <div
            className="relative flex items-center justify-between gap-3 px-4 py-2.5"
            style={{
              backgroundColor: colors.headerBg,
              borderBottom: `${clampInt(colors.headerBorderWidth, 0, 4, 1)}px solid ${colors.headerBorder}`,
              backdropFilter: `blur(${clampInt(colors.headerBlur, 0, 40, 12)}px)`,
              boxShadow: `0 12px ${clampInt(colors.headerShadowBlur, 0, 80, 30)}px ${clampInt(colors.headerShadowSpread, -80, 80, -22)}px ${colors.headerShadow}`,
            }}
          >
            {/* Brand */}
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-md flex-shrink-0" style={{ backgroundColor: colors.accentPrimary }} />
              <span className="text-xs font-bold tracking-tight" style={{ color: colors.headerText }}>
                SaaSyBase
              </span>
            </div>
            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-4">
              {['Pricing', 'Blog', 'Docs'].map((label) => (
                <span key={label} className="text-xs" style={{ color: colors.headerText }}>
                  {label}
                </span>
              ))}
            </div>
            {/* CTA + avatar */}
            <div className="flex items-center gap-2">
              <div
                className="rounded-md px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: colors.accentPrimary, color: '#fff' }}
              >
                Get started
              </div>
              <div className="h-6 w-6 rounded-full" style={{ backgroundColor: colors.accentHover }} />
            </div>
          </div>

          {/* ── Sticky header preview (compact strip) ── */}
          <div
            className="relative flex items-center justify-between gap-3 px-4 py-1.5"
            style={{
              backgroundColor: colors.stickyHeaderBg,
              borderBottom: `${clampInt(colors.stickyHeaderBorderWidth, 0, 4, 1)}px solid ${colors.stickyHeaderBorder}`,
              backdropFilter: `blur(${clampInt(colors.stickyHeaderBlur, 0, 40, 14)}px)`,
              boxShadow: `0 12px ${clampInt(colors.stickyHeaderShadowBlur, 0, 80, 30)}px ${clampInt(colors.stickyHeaderShadowSpread, -80, 80, -22)}px ${colors.stickyHeaderShadow}`,
            }}
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded flex-shrink-0" style={{ backgroundColor: colors.accentPrimary }} />
              <span className="text-[10px] font-bold tracking-tight" style={{ color: colors.stickyHeaderText }}>
                SaaSyBase
              </span>
              <span
                className="ml-1 rounded-full border px-1.5 py-px text-[9px] leading-tight"
                style={{ borderColor: colors.stickyHeaderBorder, color: colors.stickyHeaderText, opacity: 0.6 }}
              >
                sticky
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              {['Pricing', 'Blog'].map((label) => (
                <span key={label} className="text-[10px]" style={{ color: colors.stickyHeaderText }}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Body: sidebar + main ── */}
          <div className="relative flex min-h-0">
            {/* Sidebar */}
            <div
              className="relative w-32 flex-shrink-0 px-3 py-4 space-y-1"
              style={{
                backgroundColor: colors.sidebarBg,
                borderRight: `1px solid ${colors.sidebarBorder}`,
                boxShadow: `0 12px ${clampInt(colors.sidebarShadowBlur, 0, 80, clampInt(colors.panelShadowBlur, 0, 80, 24))}px ${clampInt(colors.sidebarShadowSpread, -80, 80, clampInt(colors.panelShadowSpread, -80, 80, -18))}px ${colors.sidebarShadow}`,
              }}
            >
              {[
                { label: 'Overview', active: true },
                { label: 'Billing', active: false },
                { label: 'Analytics', active: false, hovered: true },
                { label: 'Settings', active: false },
              ].map(({ label, active, hovered }) => (
                <div
                  key={label}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                  style={{
                    backgroundColor: active
                      ? `${colors.accentPrimary}18`
                      : (hovered as boolean) ? colors.bgQuaternary : 'transparent',
                    color: active ? colors.accentPrimary : colors.textSecondary,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="relative flex-1 overflow-hidden p-4 space-y-3">
              {/* Flat page heading */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: colors.textTertiary }}>
                    Workspace overview
                  </p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>
                    Dashboard
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                    Billing, activity, and team health at a glance.
                  </p>
                </div>
                <div className="grid min-w-[180px] grid-cols-2 gap-2 text-sm">
                  {[
                    { label: 'Personal', value: '18,420', detail: 'tokens available' },
                    { label: 'Workspace', value: '7,250', detail: 'shared this month' },
                  ].map(({ label, value, detail }) => (
                    <div
                      key={label}
                      className="relative px-3 py-2"
                      style={{
                        backgroundColor: `${colors.accentPrimary}14`,
                        borderStyle: 'solid',
                        borderColor: `${colors.accentPrimary}3d`,
                        borderWidth: '1px',
                        borderRadius: `${surfaceRadius}px`,
                        boxShadow: `0 12px ${clampInt(colors.cardShadowBlur, 0, 80, 24)}px ${clampInt(colors.cardShadowSpread, -80, 80, -18)}px ${colors.cardShadow}`,
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-wide"
                        style={{ color: `${colors.accentPrimary}${getHexAlpha01(colors.accentPrimary) < 1 ? '' : 'd1'}` }}
                      >
                        {label}
                      </p>
                      <p className="mt-1 text-base font-semibold" style={{ color: colors.textPrimary }}>
                        {value}
                      </p>
                      <p className="text-xs" style={{ color: `${colors.accentPrimary}${getHexAlpha01(colors.accentPrimary) < 1 ? '' : 'cc'}` }}>
                        {detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stat cards — uses cardGradient */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Revenue', value: '$4,820' },
                  { label: 'Users', value: '1,240' },
                  { label: 'Conversions', value: '8.3%' },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="relative overflow-hidden px-3 py-2.5"
                    style={{
                      background: `linear-gradient(135deg, ${statCardSurfaceWash}, ${statCardSurfaceWash}), linear-gradient(135deg, ${colors.cardGradientFrom ?? colors.pageGradientFrom}, ${colors.cardGradientVia ?? colors.pageGradientVia}, ${colors.cardGradientTo ?? colors.pageGradientTo})`,
                      borderStyle: 'solid',
                      borderColor: statCardBorderColor,
                      borderWidth: '1px',
                      borderTopWidth: `${statCardAccentTop}px`,
                      borderTopColor: statCardTopBorderColor,
                      borderRadius: `${surfaceRadius}px`,
                      boxShadow: `0 12px ${clampInt(colors.cardShadowBlur, 0, 80, 24)}px ${clampInt(colors.cardShadowSpread, -80, 80, -18)}px ${colors.cardShadow}`,
                    }}
                  >
                    {/* Accent overlays matching AdminStatCard */}
                    {statCardAccentLeft > 0 && (
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 z-[1]"
                        style={{ width: `${statCardAccentLeft}px`, backgroundColor: `${colors.accentPrimary}eb` }}
                      />
                    )}
                    {statCardAccentTop > 0 && (
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 z-[1]"
                        style={{ height: `${statCardAccentTop}px`, backgroundColor: `${colors.accentPrimary}eb` }}
                      />
                    )}
                    <p className="text-xs" style={{ color: colors.textTertiary }}>
                      {label}
                    </p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: colors.textPrimary }}>
                      {value}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: colors.accentPrimary }}>
                      ↑ 12%
                    </p>
                  </div>
                ))}
              </div>

              {/* Tab strip — uses tabsGradient */}
              <div
                className="relative flex items-center gap-1 px-1.5 py-1"
                style={{
                  borderRadius: `${surfaceRadius}px`,
                  background: `linear-gradient(135deg, ${colors.tabsGradientFrom ?? colors.pageGradientFrom}, ${colors.tabsGradientVia ?? colors.pageGradientVia}, ${colors.tabsGradientTo ?? colors.pageGradientTo})`,
                  border: `1px solid ${colors.borderPrimary}`,
                  boxShadow: `0 12px ${clampInt(colors.tabsShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))}px ${clampInt(colors.tabsShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))}px ${colors.tabsShadow}`,
                }}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-1 left-1.5 top-1 z-0 transition-transform duration-200 ease-out"
                  style={{
                    width: 'calc((100% - 12px) / 3)',
                    transform: 'translateX(0%)',
                    borderRadius: `${Math.max(surfaceRadius - 2, 4)}px`,
                    backgroundColor: colorMode === 'dark' ? '#000000' : '#ffffff',
                    boxShadow: `0 8px ${clampInt(colors.tabsShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))}px ${clampInt(colors.tabsShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))}px ${colors.tabsShadow}`,
                  }}
                />
                {['Activity', 'Invoices', 'Team'].map((label, i) => (
                  <div
                    key={label}
                    className="relative z-10 px-3 py-1 text-xs font-medium"
                    style={{
                      color: i === 0 ? colors.accentPrimary : colors.textSecondary,
                      borderRadius: `${Math.max(surfaceRadius - 2, 4)}px`,
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Panel / table card */}
              <div
                className="px-3 py-2.5"
                style={{
                  backgroundColor: colors.panelBg,
                  border: `1px solid ${colors.borderPrimary}b3`,
                  borderRadius: `${surfaceRadius}px`,
                  boxShadow: `0 12px ${clampInt(colors.panelShadowBlur, 0, 80, clampInt(colors.cardShadowBlur, 0, 80, 24))}px ${clampInt(colors.panelShadowSpread, -80, 80, clampInt(colors.cardShadowSpread, -80, 80, -18))}px ${colors.panelShadow}`,
                }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: colors.textPrimary }}>
                  Recent activity
                </p>
                {['Invoice #1042 paid', 'New signup: maria@co.io', 'Plan upgraded to Pro'].map((row, i) => (
                  <div
                    key={row}
                    className="flex items-center justify-between py-1.5 text-xs"
                    style={{
                      borderTop: i > 0 ? `1px solid ${colors.borderPrimary}80` : 'none',
                      color: colors.textSecondary,
                    }}
                  >
                    <span>{row}</span>
                    <span style={{ color: colors.textTertiary }}>{i === 0 ? '2 min' : i === 1 ? '5 min' : 'just now'}</span>
                  </div>
                ))}
              </div>

              {/* Input row */}
              <div className="flex gap-2">
                <div
                  role="textbox"
                  aria-readonly="true"
                  className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: colors.bgTertiary,
                    borderColor: colors.borderSecondary,
                    color: colors.textTertiary,
                    userSelect: 'none',
                  }}
                >
                  Search…
                </div>
                <div
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: colors.accentPrimary, color: '#fff' }}
                >
                  Search
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Token-coverage legend */}
        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-500">
          All color, gradient, shadow, glow, layout, and structural tokens are reflected above.
          The thin strip below the header shows sticky-header colors.
          The &quot;Analytics&quot; sidebar item shows the hover fill (<span className="font-semibold">bgQuaternary</span>).
        </p>
      </section>
    </div>
  );
}
