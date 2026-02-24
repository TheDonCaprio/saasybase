"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ThemeLink } from '../../../lib/settings';
import { showToast } from '../../ui/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCompass, 
  faNewspaper, 
  faTableCells, 
  faCode, 
  faPlus, 
  faTrash, 
  faArrowRotateLeft, 
  faFloppyDisk,
  faLink,
  faTable,
  faGripVertical,
  faClock,
  faFileText,
  faEye,
  faEyeSlash,
  faArrowUp,
  faArrowDown,
  faPalette,
} from '@fortawesome/free-solid-svg-icons';
import SimplePageEditor from '../pages/SimplePageEditor';

// ─── Color-palette data (client-side types & defaults) ──────────────────────

type ColorHexKey =
  | 'bgPrimary'
  | 'bgSecondary'
  | 'panelBg'
  | 'heroBg'
  | 'bgTertiary'
  | 'bgQuaternary'
  | 'textPrimary'
  | 'textSecondary'
  | 'textTertiary'
  | 'borderPrimary'
  | 'borderSecondary'
  | 'accentPrimary'
  | 'accentHover'
  | 'headerBg'
  | 'sidebarBg'
  | 'pageGradientFrom'
  | 'pageGradientVia'
  | 'pageGradientTo'
  | 'heroGradientFrom'
  | 'heroGradientVia'
  | 'heroGradientTo'
  | 'cardGradientFrom'
  | 'cardGradientVia'
  | 'cardGradientTo'
  | 'tabsGradientFrom'
  | 'tabsGradientVia'
  | 'tabsGradientTo'
  | 'pageGlow';

type OpacityKey = 'headerOpacity' | 'sidebarOpacity' | 'glowOpacity';

type ColorTokens = {
  bgPrimary: string;
  bgSecondary: string;
  panelBg: string;
  heroBg: string;
  bgTertiary: string;
  bgQuaternary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  borderPrimary: string;
  borderSecondary: string;
  accentPrimary: string;
  accentHover: string;
  headerBg: string;
  headerOpacity: number;
  sidebarBg: string;
  sidebarOpacity: number;
  pageGradientFrom: string;
  pageGradientVia: string;
  pageGradientTo: string;
  heroGradientFrom: string;
  heroGradientVia: string;
  heroGradientTo: string;
  cardGradientFrom: string;
  cardGradientVia: string;
  cardGradientTo: string;
  tabsGradientFrom: string;
  tabsGradientVia: string;
  tabsGradientTo: string;
  pageGlow: string;
  glowOpacity: number;
};

type ElementGradientKeys =
  | 'heroGradientFrom'
  | 'heroGradientVia'
  | 'heroGradientTo'
  | 'cardGradientFrom'
  | 'cardGradientVia'
  | 'cardGradientTo'
  | 'tabsGradientFrom'
  | 'tabsGradientVia'
  | 'tabsGradientTo';

type PartialColorTokens = Omit<ColorTokens, ElementGradientKeys> & Partial<Pick<ColorTokens, ElementGradientKeys>>;

const fillElementGradients = (t: PartialColorTokens): ColorTokens => {
  return {
    ...(t as Omit<ColorTokens, ElementGradientKeys>),
    heroGradientFrom: t.heroGradientFrom ?? t.pageGradientFrom,
    heroGradientVia: t.heroGradientVia ?? t.pageGradientVia,
    heroGradientTo: t.heroGradientTo ?? t.pageGradientTo,
    cardGradientFrom: t.cardGradientFrom ?? t.pageGradientFrom,
    cardGradientVia: t.cardGradientVia ?? t.pageGradientVia,
    cardGradientTo: t.cardGradientTo ?? t.pageGradientTo,
    tabsGradientFrom: t.tabsGradientFrom ?? t.pageGradientFrom,
    tabsGradientVia: t.tabsGradientVia ?? t.pageGradientVia,
    tabsGradientTo: t.tabsGradientTo ?? t.pageGradientTo,
  };
};

type ThemeColorPalette = { light: ColorTokens; dark: ColorTokens };

type ThemeColorPreset = { name: string; light: ColorTokens; dark: ColorTokens };

const DEFAULT_LIGHT_COLORS: ColorTokens = {
  bgPrimary: '#ffffff', bgSecondary: '#f9fafb', panelBg: '#f9fafb', heroBg: '#f9fafb', bgTertiary: '#f3f4f6', bgQuaternary: '#e5e7eb',
  textPrimary: '#111827', textSecondary: '#4b5563', textTertiary: '#6b7280',
  borderPrimary: '#d1d5db', borderSecondary: '#9ca3af',
  accentPrimary: '#3b82f6', accentHover: '#2563eb',
  headerBg: '#ffffff', headerOpacity: 0.8,
  sidebarBg: '#ffffff', sidebarOpacity: 0.9,
  pageGradientFrom: '#f0f9ff', pageGradientVia: '#eef2ff', pageGradientTo: '#ffffff',
  heroGradientFrom: '#f0f9ff', heroGradientVia: '#eef2ff', heroGradientTo: '#ffffff',
  cardGradientFrom: '#f0f9ff', cardGradientVia: '#eef2ff', cardGradientTo: '#ffffff',
  tabsGradientFrom: '#f0f9ff', tabsGradientVia: '#eef2ff', tabsGradientTo: '#ffffff',
  pageGlow: '#3b82f6', glowOpacity: 0.18,
};

const DEFAULT_DARK_COLORS: ColorTokens = {
  bgPrimary: '#0a0a0a', bgSecondary: '#171717', panelBg: '#171717', heroBg: '#171717', bgTertiary: '#262626', bgQuaternary: '#404040',
  textPrimary: '#f5f5f5', textSecondary: '#a3a3a3', textTertiary: '#737373',
  borderPrimary: '#404040', borderSecondary: '#525252',
  accentPrimary: '#3b82f6', accentHover: '#2563eb',
  headerBg: '#0a0a0a', headerOpacity: 0.7,
  sidebarBg: '#171717', sidebarOpacity: 0.5,
  pageGradientFrom: '#171717', pageGradientVia: '#312e81', pageGradientTo: '#0a0a0a',
  heroGradientFrom: '#171717', heroGradientVia: '#312e81', heroGradientTo: '#0a0a0a',
  cardGradientFrom: '#171717', cardGradientVia: '#312e81', cardGradientTo: '#0a0a0a',
  tabsGradientFrom: '#171717', tabsGradientVia: '#312e81', tabsGradientTo: '#0a0a0a',
  pageGlow: '#6366f1', glowOpacity: 0.12,
};

const COLOR_LABELS: Record<ColorHexKey, string> = {
  bgPrimary:       'Page background',
  bgSecondary:     'Stat / info cards',
  heroBg:          'Top hero',
  panelBg:         'Panels',
  bgTertiary:      'Input fields',
  bgQuaternary:    'Hover fills',
  textPrimary:     'Primary text',
  textSecondary:   'Secondary text',
  textTertiary:    'Placeholder text',
  borderPrimary:   'Primary border',
  borderSecondary: 'Secondary border',
  accentPrimary:   'Primary accent',
  accentHover:     'Accent hover',
  headerBg:        'Header background',
  sidebarBg:       'Sidebar background',
  pageGradientFrom:'Content area (from)',
  pageGradientVia: 'Content area (via)',
  pageGradientTo:  'Content area (to)',
  heroGradientFrom:'Top hero gradient (from)',
  heroGradientVia: 'Top hero gradient (via)',
  heroGradientTo:  'Top hero gradient (to)',
  cardGradientFrom:'Stat / info gradient (from)',
  cardGradientVia: 'Stat / info gradient (via)',
  cardGradientTo:  'Stat / info gradient (to)',
  tabsGradientFrom:'Tab strip gradient (from)',
  tabsGradientVia: 'Tab strip gradient (via)',
  tabsGradientTo:  'Tab strip gradient (to)',
  pageGlow:        'Backdrop glow accent',
};

const COLOR_GROUPS: Array<{ title: string; keys: ColorHexKey[] }> = [
  { title: 'Backgrounds', keys: ['bgPrimary', 'bgTertiary', 'bgQuaternary'] },
  { title: 'Surfaces', keys: ['bgSecondary', 'heroBg', 'panelBg'] },
  { title: 'Text',        keys: ['textPrimary', 'textSecondary', 'textTertiary'] },
  { title: 'Borders',     keys: ['borderPrimary', 'borderSecondary'] },
  { title: 'Accents',     keys: ['accentPrimary', 'accentHover'] },
  { title: 'Layout',      keys: ['headerBg', 'sidebarBg'] },
  { title: 'Content Area', keys: ['pageGradientFrom', 'pageGradientVia', 'pageGradientTo'] },
  { title: 'Top Hero Gradient', keys: ['heroGradientFrom', 'heroGradientVia', 'heroGradientTo'] },
  { title: 'Stat / Info Gradient', keys: ['cardGradientFrom', 'cardGradientVia', 'cardGradientTo'] },
  { title: 'Tab Strip Gradient', keys: ['tabsGradientFrom', 'tabsGradientVia', 'tabsGradientTo'] },
  { title: 'Backdrop Glow', keys: ['pageGlow'] },
];

const LIGHT_PRESETS: Array<{ name: string; accent: string; colors: PartialColorTokens }> = [
  {
    name: 'Default',
    accent: DEFAULT_LIGHT_COLORS.accentPrimary,
    colors: DEFAULT_LIGHT_COLORS,
  },
  {
    name: 'Warm',
    accent: '#fef3dc',
    colors: {
      bgPrimary: '#fffbf5', bgSecondary: '#fef8ee', panelBg: DEFAULT_LIGHT_COLORS.panelBg, heroBg: DEFAULT_LIGHT_COLORS.heroBg, bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary, bgQuaternary: '#fde9be',
      textPrimary: '#1c1009', textSecondary: '#78461d', textTertiary: '#9a6b3c',
      borderPrimary: '#f5d9a0', borderSecondary: '#e8bc6a',
      accentPrimary: '#f59e0b', accentHover: '#d97706',
      headerBg: '#fffbf5', headerOpacity: 0.8,
      sidebarBg: '#fffbf5', sidebarOpacity: 0.9,
      pageGradientFrom: '#fffbf5', pageGradientVia: '#fef3dc', pageGradientTo: '#ffffff',
      pageGlow: '#f59e0b', glowOpacity: 0.18,
    },
  },
  {
    name: 'Ocean',
    accent: '#e0f2fe',
    colors: {
      bgPrimary: '#f0f9ff', bgSecondary: '#e0f2fe', panelBg: DEFAULT_LIGHT_COLORS.panelBg, heroBg: DEFAULT_LIGHT_COLORS.heroBg, bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary, bgQuaternary: '#7dd3fc',
      textPrimary: '#0c2d48', textSecondary: '#0369a1', textTertiary: '#0284c7',
      borderPrimary: '#bae6fd', borderSecondary: '#7dd3fc',
      accentPrimary: '#0ea5e9', accentHover: '#0284c7',
      headerBg: '#f0f9ff', headerOpacity: 0.8,
      sidebarBg: '#f0f9ff', sidebarOpacity: 0.9,
      pageGradientFrom: '#f0f9ff', pageGradientVia: '#e0f2fe', pageGradientTo: '#ffffff',
      pageGlow: '#0ea5e9', glowOpacity: 0.18,
    },
  },
  {
    name: 'Lavender',
    accent: '#f3e8ff',
    colors: {
      bgPrimary: '#faf5ff', bgSecondary: '#f3e8ff', panelBg: DEFAULT_LIGHT_COLORS.panelBg, heroBg: DEFAULT_LIGHT_COLORS.heroBg, bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary, bgQuaternary: '#d8b4fe',
      textPrimary: '#2e1065', textSecondary: '#7e22ce', textTertiary: '#9333ea',
      borderPrimary: '#e9d5ff', borderSecondary: '#d8b4fe',
      accentPrimary: '#a855f7', accentHover: '#9333ea',
      headerBg: '#faf5ff', headerOpacity: 0.8,
      sidebarBg: '#faf5ff', sidebarOpacity: 0.9,
      pageGradientFrom: '#faf5ff', pageGradientVia: '#f3e8ff', pageGradientTo: '#ffffff',
      pageGlow: '#a855f7', glowOpacity: 0.18,
    },
  },
  {
    name: 'Sage',
    accent: '#dcfce7',
    colors: {
      bgPrimary: '#f0fdf4', bgSecondary: '#dcfce7', panelBg: DEFAULT_LIGHT_COLORS.panelBg, heroBg: DEFAULT_LIGHT_COLORS.heroBg, bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary, bgQuaternary: '#86efac',
      textPrimary: '#052e16', textSecondary: '#15803d', textTertiary: '#16a34a',
      borderPrimary: '#bbf7d0', borderSecondary: '#86efac',
      accentPrimary: '#22c55e', accentHover: '#16a34a',
      headerBg: '#f0fdf4', headerOpacity: 0.8,
      sidebarBg: '#f0fdf4', sidebarOpacity: 0.9,
      pageGradientFrom: '#f0fdf4', pageGradientVia: '#dcfce7', pageGradientTo: '#ffffff',
      pageGlow: '#22c55e', glowOpacity: 0.18,
    },
  },
  {
    name: 'Sunset',
    accent: '#fff1f2',
    colors: {
      bgPrimary: '#fff7f7', bgSecondary: '#fff1f2', panelBg: DEFAULT_LIGHT_COLORS.panelBg, heroBg: DEFAULT_LIGHT_COLORS.heroBg, bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary, bgQuaternary: '#fecdd3',
      textPrimary: '#1f0b0f', textSecondary: '#7f1d1d', textTertiary: '#9f1239',
      borderPrimary: '#fecdd3', borderSecondary: '#fda4af',
      accentPrimary: '#fb7185', accentHover: '#e11d48',
      headerBg: '#fff7f7', headerOpacity: 0.82,
      sidebarBg: '#fff7f7', sidebarOpacity: 0.92,
      pageGradientFrom: '#fff7f7', pageGradientVia: '#ffe4e6', pageGradientTo: '#ffffff',
      pageGlow: '#fb7185', glowOpacity: 0.18,
    },
  },
  {
    name: 'Citrine',
    accent: '#fffbeb',
    colors: {
      bgPrimary: '#ffffff', bgSecondary: '#fffbeb', panelBg: DEFAULT_LIGHT_COLORS.panelBg, heroBg: DEFAULT_LIGHT_COLORS.heroBg, bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary, bgQuaternary: '#fde68a',
      textPrimary: '#1f1500', textSecondary: '#78350f', textTertiary: '#92400e',
      borderPrimary: '#fde68a', borderSecondary: '#fbbf24',
      accentPrimary: '#f59e0b', accentHover: '#b45309',
      headerBg: '#fffbeb', headerOpacity: 0.8,
      sidebarBg: '#fffbeb', sidebarOpacity: 0.9,
      pageGradientFrom: '#fffbeb', pageGradientVia: '#fef3c7', pageGradientTo: '#ffffff',
      pageGlow: '#f59e0b', glowOpacity: 0.16,
    },
  },
];

const DARK_PRESETS: Array<{ name: string; accent: string; colors: PartialColorTokens }> = [
  {
    name: 'Default',
    accent: DEFAULT_DARK_COLORS.accentPrimary,
    colors: DEFAULT_DARK_COLORS,
  },
  {
    name: 'Midnight',
    accent: '#0a1628',
    colors: {
      bgPrimary: '#020616', bgSecondary: '#0a1628', panelBg: DEFAULT_DARK_COLORS.panelBg, heroBg: DEFAULT_DARK_COLORS.heroBg, bgTertiary: DEFAULT_DARK_COLORS.bgTertiary, bgQuaternary: '#1e3a5f',
      textPrimary: '#e0f2fe', textSecondary: '#7dd3fc', textTertiary: '#38bdf8',
      borderPrimary: '#1e3a5f', borderSecondary: '#2e4e7e',
      accentPrimary: '#38bdf8', accentHover: '#0ea5e9',
      headerBg: '#020616', headerOpacity: 0.7,
      sidebarBg: '#0a1628', sidebarOpacity: 0.5,
      pageGradientFrom: '#020616', pageGradientVia: '#0a1628', pageGradientTo: '#020616',
      pageGlow: '#38bdf8', glowOpacity: 0.12,
    },
  },
  {
    name: 'Amethyst',
    accent: '#1a0f2e',
    colors: {
      bgPrimary: '#0f0a1f', bgSecondary: '#1a0f2e', panelBg: DEFAULT_DARK_COLORS.panelBg, heroBg: DEFAULT_DARK_COLORS.heroBg, bgTertiary: DEFAULT_DARK_COLORS.bgTertiary, bgQuaternary: '#3d2468',
      textPrimary: '#ede9fe', textSecondary: '#c084fc', textTertiary: '#a855f7',
      borderPrimary: '#3d2468', borderSecondary: '#5b3a8a',
      accentPrimary: '#c084fc', accentHover: '#a855f7',
      headerBg: '#0f0a1f', headerOpacity: 0.7,
      sidebarBg: '#1a0f2e', sidebarOpacity: 0.5,
      pageGradientFrom: '#0f0a1f', pageGradientVia: '#1a0f2e', pageGradientTo: '#0a0a0a',
      pageGlow: '#c084fc', glowOpacity: 0.12,
    },
  },
  {
    name: 'Obsidian',
    accent: '#0a0a0a',
    colors: {
      bgPrimary: '#000000', bgSecondary: '#0a0a0a', panelBg: DEFAULT_DARK_COLORS.panelBg, heroBg: DEFAULT_DARK_COLORS.heroBg, bgTertiary: DEFAULT_DARK_COLORS.bgTertiary, bgQuaternary: '#1f1f1f',
      textPrimary: '#ffffff', textSecondary: '#a0a0a0', textTertiary: '#6b6b6b',
      borderPrimary: '#1f1f1f', borderSecondary: '#2d2d2d',
      accentPrimary: '#6366f1', accentHover: '#4f46e5',
      headerBg: '#000000', headerOpacity: 0.7,
      sidebarBg: '#0a0a0a', sidebarOpacity: 0.5,
      pageGradientFrom: '#000000', pageGradientVia: '#0a0a0a', pageGradientTo: '#000000',
      pageGlow: '#6366f1', glowOpacity: 0.12,
    },
  },
  {
    name: 'Forest',
    accent: '#0d261e',
    colors: {
      bgPrimary: '#071612', bgSecondary: '#0d261e', panelBg: DEFAULT_DARK_COLORS.panelBg, heroBg: DEFAULT_DARK_COLORS.heroBg, bgTertiary: DEFAULT_DARK_COLORS.bgTertiary, bgQuaternary: '#1c4d3a',
      textPrimary: '#d1fae5', textSecondary: '#6ee7b7', textTertiary: '#34d399',
      borderPrimary: '#1c4d3a', borderSecondary: '#276048',
      accentPrimary: '#34d399', accentHover: '#10b981',
      headerBg: '#071612', headerOpacity: 0.7,
      sidebarBg: '#0d261e', sidebarOpacity: 0.5,
      pageGradientFrom: '#071612', pageGradientVia: '#0d261e', pageGradientTo: '#071612',
      pageGlow: '#34d399', glowOpacity: 0.12,
    },
  },
  {
    name: 'Neon Rose',
    accent: '#0b0b14',
    colors: {
      bgPrimary: '#070712', bgSecondary: '#0b0b14', panelBg: DEFAULT_DARK_COLORS.panelBg, heroBg: DEFAULT_DARK_COLORS.heroBg, bgTertiary: DEFAULT_DARK_COLORS.bgTertiary, bgQuaternary: '#1f1f3a',
      textPrimary: '#f5f5f5', textSecondary: '#fbcfe8', textTertiary: '#fda4af',
      borderPrimary: '#1f1f3a', borderSecondary: '#2b2b55',
      accentPrimary: '#fb7185', accentHover: '#e11d48',
      headerBg: '#070712', headerOpacity: 0.72,
      sidebarBg: '#0b0b14', sidebarOpacity: 0.52,
      pageGradientFrom: '#070712', pageGradientVia: '#131326', pageGradientTo: '#000000',
      pageGlow: '#fb7185', glowOpacity: 0.13,
    },
  },
];

interface ColorTabContentProps {
  lightColors: ColorTokens;
  darkColors: ColorTokens;
  colorMode: 'light' | 'dark';
  onColorMode: (m: 'light' | 'dark') => void;
  onLightChange: (c: ColorTokens) => void;
  onDarkChange:  (c: ColorTokens) => void;
  customPresets?: ThemeColorPreset[];
  onSavePreset?: (name: string) => void;
  onDeletePreset?: (name: string) => void;
}

function ColorTabContent({
  lightColors,
  darkColors,
  colorMode,
  onColorMode,
  onLightChange,
  onDarkChange,
  customPresets = [],
  onSavePreset,
  onDeletePreset,
}: ColorTabContentProps) {
  const colors  = colorMode === 'light' ? lightColors  : darkColors;
  const builtInPresets = colorMode === 'light' ? LIGHT_PRESETS : DARK_PRESETS;
  const setColors = colorMode === 'light' ? onLightChange : onDarkChange;

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
    const keys = Object.keys(DEFAULT_LIGHT_COLORS) as (keyof ColorTokens)[];
    return keys.every((k) => colors[k] === preset[k]);
  };

  return (
    <div className="space-y-8">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-neutral-700 dark:bg-neutral-900">
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Presets</div>
          {onSavePreset ? (
            <button
              type="button"
              onClick={() => {
                const name = (window.prompt('Save preset as…') || '').trim();
                if (!name) return;
                onSavePreset(name);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <FontAwesomeIcon icon={faFloppyDisk} className="h-3.5 w-3.5" />
              Save current as preset
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {presets.map((preset) => {
            const active = isPresetActive(preset.colors);
            return (
              <div key={`${preset.source}-${preset.name}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColors(preset.colors)}
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
                      const ok = window.confirm(`Delete preset "${preset.name}"?`);
                      if (!ok) return;
                      onDeletePreset(preset.name);
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

      {/* Per-token pickers */}
      <section className="space-y-6">
        {COLOR_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">{group.title}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.keys.map((key) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                  <span className="text-sm text-slate-700 dark:text-neutral-300">{COLOR_LABELS[key]}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-6 w-6 rounded border border-black/10 flex-shrink-0"
                      style={{ backgroundColor: colors[key] }}
                    />
                    <input
                      type="color"
                      value={colors[key]}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5 dark:border-neutral-600"
                      title={COLOR_LABELS[key]}
                    />
                    <input
                      type="text"
                      value={colors[key]}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{0,6}$/.test(v)) updateColor(key, v.length === 7 ? v : v);
                      }}
                      maxLength={7}
                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Opacity controls */}
      <section>
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">Opacity</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(() => {
            const updateOpacityPercent = (key: OpacityKey, percent: number) => {
              const clamped = Math.max(0, Math.min(100, percent));
              const next = Math.round(clamped) / 100;
              setColors({ ...colors, [key]: next });
            };

            const opacityFields: Array<{ key: OpacityKey; label: string }> = [
              { key: 'headerOpacity', label: 'Header opacity' },
              { key: 'sidebarOpacity', label: 'Sidebar opacity' },
              { key: 'glowOpacity', label: 'Backdrop glow opacity' },
            ];

            return opacityFields.map((f) => (
              <div key={`${colorMode}-${f.key}`} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">{f.label}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((colors[f.key] ?? 0) * 100)}
                    onChange={(e) => updateOpacityPercent(f.key, Number(e.target.value))}
                    className="h-2 w-full flex-1 cursor-pointer"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((colors[f.key] ?? 0) * 100)}
                    onChange={(e) => updateOpacityPercent(f.key, Number(e.target.value))}
                    className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    aria-label={`${f.label} percent`}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-neutral-400">Percent (0–100)</p>
              </div>
            ));
          })()}
        </div>
      </section>

      {/* Live preview */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Live preview</div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">{colorMode} mode</span>
        </div>

        {/* Browser chrome */}
        <div className="overflow-hidden rounded-2xl border shadow-lg" style={{ borderColor: colors.borderPrimary }}>

          {/* ── Topbar / header ── */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5"
            style={{ backgroundColor: colors.headerBg, borderBottom: `1px solid ${colors.borderPrimary}` }}
          >
            {/* Brand */}
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-md flex-shrink-0" style={{ backgroundColor: colors.accentPrimary }} />
              <span className="text-xs font-bold tracking-tight" style={{ color: colors.textPrimary }}>SaaSyBase</span>
            </div>
            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-4">
              {['Pricing', 'Blog', 'Docs'].map((label) => (
                <span key={label} className="text-xs" style={{ color: colors.textSecondary }}>{label}</span>
              ))}
            </div>
            {/* CTA + avatar */}
            <div className="flex items-center gap-2">
              <div className="rounded-md px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: colors.accentPrimary }}>
                Get started
              </div>
              <div className="h-6 w-6 rounded-full" style={{ backgroundColor: colors.accentHover }} />
            </div>
          </div>

          {/* ── Body: sidebar + main ── */}
          <div
            className="flex min-h-0"
            style={{
              background: `linear-gradient(135deg, ${colors.pageGradientFrom}, ${colors.pageGradientVia}, ${colors.pageGradientTo})`,
            }}
          >
            {/* Sidebar */}
            <div
              className="w-32 flex-shrink-0 px-3 py-4 space-y-1"
              style={{ backgroundColor: colors.sidebarBg, borderRight: `1px solid ${colors.borderPrimary}` }}
            >
              {[
                { label: 'Overview', active: true },
                { label: 'Billing', active: false },
                { label: 'Analytics', active: false },
                { label: 'Settings', active: false },
              ].map(({ label, active }) => (
                <div
                  key={label}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                  style={{
                    backgroundColor: active ? `${colors.accentPrimary}18` : 'transparent',
                    color: active ? colors.accentPrimary : colors.textSecondary,
                    borderLeft: active ? `2px solid ${colors.accentPrimary}` : '2px solid transparent',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-hidden p-4 space-y-3">

              {/* Hero strip */}
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{
                  backgroundColor: colors.heroBg,
                  border: `1px solid ${colors.borderPrimary}`,
                }}
              >
                <div>
                  <p className="text-xs font-semibold" style={{ color: colors.textPrimary }}>Welcome back, Alex 👋</p>
                  <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>Here's what's happening today.</p>
                </div>
                <div className="rounded-lg px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: colors.accentPrimary }}>Upgrade</div>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Revenue', value: '$4,820' },
                  { label: 'Users', value: '1,240' },
                  { label: 'Conversions', value: '8.3%' },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl px-3 py-2.5"
                    style={{
                      backgroundColor: colors.bgSecondary,
                      border: `1px solid ${colors.borderPrimary}`,
                    }}
                  >
                    <p className="text-xs" style={{ color: colors.textTertiary }}>{label}</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: colors.textPrimary }}>{value}</p>
                    <p className="text-xs mt-0.5" style={{ color: colors.accentPrimary }}>↑ 12%</p>
                  </div>
                ))}
              </div>

              {/* Tab strip */}
              <div
                className="flex items-center gap-1 rounded-xl px-2 py-1.5"
                style={{
                  background: `linear-gradient(135deg, ${colors.tabsGradientFrom ?? colors.pageGradientFrom}, ${colors.tabsGradientVia ?? colors.pageGradientVia}, ${colors.tabsGradientTo ?? colors.pageGradientTo})`,
                  border: `1px solid ${colors.borderPrimary}`,
                }}
              >
                {['Activity', 'Invoices', 'Team'].map((label, i) => (
                  <div
                    key={label}
                    className="rounded-lg px-3 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: i === 0 ? colors.bgPrimary : 'transparent',
                      color: i === 0 ? colors.accentPrimary : colors.textSecondary,
                      boxShadow: i === 0 ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Panel / table card */}
              <div
                className="rounded-xl px-3 py-2.5"
                style={{ backgroundColor: colors.panelBg, border: `1px solid ${colors.borderPrimary}` }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: colors.textPrimary }}>Recent activity</p>
                {['Invoice #1042 paid', 'New signup: maria@co.io', 'Plan upgraded to Pro'].map((row) => (
                  <div
                    key={row}
                    className="flex items-center justify-between py-1 text-xs"
                    style={{ borderTop: `1px solid ${colors.borderPrimary}`, color: colors.textSecondary }}
                  >
                    <span>{row}</span>
                    <span style={{ color: colors.textTertiary }}>just now</span>
                  </div>
                ))}
              </div>

              {/* Input row */}
              <div className="flex gap-2">
                <input
                  readOnly
                  value="Search…"
                  className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: colors.bgTertiary,
                    borderColor: colors.borderSecondary,
                    color: colors.textTertiary,
                  }}
                />
                <div
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white flex-shrink-0"
                  style={{ backgroundColor: colors.accentPrimary }}
                >Search</div>
              </div>

            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface PricingSettings {
  maxColumns: number;
  centerUneven: boolean;
}

interface BlogSidebarWidget {
  id: string;
  type: 'recent-posts' | 'rich-content' | 'raw-html';
  title: string;
  enabled: boolean;
  order: number;
  settings: {
    recentCount?: number;
    content?: string;
    html?: string;
  };
}

interface ThemeSettingsTabsProps {
  initialHeaderLinks: ThemeLink[];
  initialFooterLinks: ThemeLink[];
  initialFooterText: string;
  initialCustomCss: string;
  initialCustomHead: string;
  initialCustomBody: string;
  initialPricingSettings: PricingSettings;
  initialBlogListingStyle: string;
  initialBlogListingPageSize?: number;
  initialBlogSidebarSettings: {
    enabled: boolean; // legacy
    enabledIndex?: boolean;
      enabledPages?: boolean;
    enabledSingle?: boolean;
    showRecent: boolean;
    recentCount: number;
    content: string;
    html: string;
    widgetOrder?: string[];
  };
  initialRelatedPostsEnabled?: boolean;
  initialBlogHtmlBeforeFirst?: string;
  initialBlogHtmlMiddle?: string;
  initialBlogHtmlAfterLast?: string;
  initialColorPalette?: ThemeColorPalette;
  initialColorPresets?: ThemeColorPreset[];
}

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

const MAX_LINKS = 10;
const isSafeHref = (href: string) => /^(https?:\/\/|\/)/i.test(href);
const emptyLink = (): ThemeLink => ({ label: '', href: '' });

export function ThemeSettingsTabs({
  initialHeaderLinks,
  initialFooterLinks,
  initialFooterText,
  initialCustomCss,
  initialCustomHead,
  initialCustomBody,
  initialPricingSettings,
  initialBlogListingStyle,
  initialBlogListingPageSize,
  initialBlogSidebarSettings,
  initialRelatedPostsEnabled,
  initialBlogHtmlBeforeFirst,
  initialBlogHtmlMiddle,
  initialBlogHtmlAfterLast,
  initialColorPalette,
  initialColorPresets,
}: ThemeSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<string>('navigation');

  const hexToSpaceRgb = useCallback((hex: string): string => {
    const clean = (hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '0 0 0';
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `${r} ${g} ${b}`;
  }, []);

  const applyPaletteToDocument = useCallback((palette: ThemeColorPalette) => {
    if (typeof document === 'undefined') return;

    const buildBlock = (t: ColorTokens, mode: 'light' | 'dark') => {
      const headerOpacity = (typeof t.headerOpacity === 'number' ? t.headerOpacity : (mode === 'light' ? 0.8 : 0.7)).toFixed(2);
      const sidebarOpacity = (typeof t.sidebarOpacity === 'number' ? t.sidebarOpacity : (mode === 'light' ? 0.9 : 0.5)).toFixed(2);
      const glowOpacity = (typeof t.glowOpacity === 'number' ? t.glowOpacity : (mode === 'light' ? 0.18 : 0.12)).toFixed(2);
      return [
        `  --bg-primary: ${hexToSpaceRgb(t.bgPrimary)};`,
        `  --bg-secondary: ${hexToSpaceRgb(t.panelBg ?? t.bgSecondary)};`,
        `  --surface-panel: ${hexToSpaceRgb(t.panelBg ?? t.bgSecondary)};`,
        `  --surface-card: ${hexToSpaceRgb(t.bgSecondary)};`,
        `  --surface-hero: ${hexToSpaceRgb(t.heroBg ?? t.bgSecondary)};`,
        `  --bg-tertiary: ${hexToSpaceRgb(t.bgTertiary)};`,
        `  --bg-quaternary: ${hexToSpaceRgb(t.bgQuaternary)};`,
        `  --text-primary: ${hexToSpaceRgb(t.textPrimary)};`,
        `  --text-secondary: ${hexToSpaceRgb(t.textSecondary)};`,
        `  --text-tertiary: ${hexToSpaceRgb(t.textTertiary)};`,
        `  --border-primary: ${hexToSpaceRgb(t.borderPrimary)};`,
        `  --border-secondary: ${hexToSpaceRgb(t.borderSecondary)};`,
        `  --accent-primary: ${hexToSpaceRgb(t.accentPrimary)};`,
        `  --accent-hover: ${hexToSpaceRgb(t.accentHover)};`,
        `  --theme-header-bg: rgb(${hexToSpaceRgb(t.headerBg)} / ${headerOpacity});`,
        `  --theme-sidebar-bg: rgb(${hexToSpaceRgb(t.sidebarBg)} / ${sidebarOpacity});`,
        `  --theme-page-gradient-from: rgb(${hexToSpaceRgb(t.pageGradientFrom)});`,
        `  --theme-page-gradient-via: rgb(${hexToSpaceRgb(t.pageGradientVia)});`,
        `  --theme-page-gradient-to: rgb(${hexToSpaceRgb(t.pageGradientTo)});`,
        `  --theme-hero-gradient-from: rgb(${hexToSpaceRgb(t.heroGradientFrom ?? t.pageGradientFrom)});`,
        `  --theme-hero-gradient-via: rgb(${hexToSpaceRgb(t.heroGradientVia ?? t.pageGradientVia)});`,
        `  --theme-hero-gradient-to: rgb(${hexToSpaceRgb(t.heroGradientTo ?? t.pageGradientTo)});`,
        `  --theme-card-gradient-from: rgb(${hexToSpaceRgb(t.cardGradientFrom ?? t.pageGradientFrom)});`,
        `  --theme-card-gradient-via: rgb(${hexToSpaceRgb(t.cardGradientVia ?? t.pageGradientVia)});`,
        `  --theme-card-gradient-to: rgb(${hexToSpaceRgb(t.cardGradientTo ?? t.pageGradientTo)});`,
        `  --theme-tabs-gradient-from: rgb(${hexToSpaceRgb(t.tabsGradientFrom ?? t.pageGradientFrom)});`,
        `  --theme-tabs-gradient-via: rgb(${hexToSpaceRgb(t.tabsGradientVia ?? t.pageGradientVia)});`,
        `  --theme-tabs-gradient-to: rgb(${hexToSpaceRgb(t.tabsGradientTo ?? t.pageGradientTo)});`,
        `  --theme-page-glow: rgb(${hexToSpaceRgb(t.pageGlow)} / ${glowOpacity});`,
      ].join('\n');
    };

    const css = `html.light {\n${buildBlock(palette.light, 'light')}\n}\nhtml.dark {\n${buildBlock(palette.dark, 'dark')}\n}`;
    const styleId = 'runtime-theme-color-vars';
    let tag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = styleId;
      tag.setAttribute('data-theme-color-vars', 'runtime');
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [hexToSpaceRgb]);
  
  // Navigation state
  const [headerLinks, setHeaderLinks] = useState<ThemeLink[]>(() => 
    initialHeaderLinks.length ? initialHeaderLinks : [emptyLink()]
  );
  const [footerLinks, setFooterLinks] = useState<ThemeLink[]>(() => 
    initialFooterLinks.length ? initialFooterLinks : [emptyLink()]
  );
  const [footerText, setFooterText] = useState(initialFooterText);

  const [colorPresets, setColorPresets] = useState<ThemeColorPreset[]>(() => initialColorPresets ?? []);
  
  // Content state
  const [blogListingStyle, setBlogListingStyle] = useState(initialBlogListingStyle);
  const [blogListingPageSize, setBlogListingPageSize] = useState<number>(initialBlogListingPageSize || 10);
  const [blogSidebarEnabledIndex, setBlogSidebarEnabledIndex] = useState<boolean>(
    typeof initialBlogSidebarSettings.enabledIndex === 'boolean' ? initialBlogSidebarSettings.enabledIndex : initialBlogSidebarSettings.enabled
  );
  const [blogSidebarEnabledSingle, setBlogSidebarEnabledSingle] = useState<boolean>(
    typeof initialBlogSidebarSettings.enabledSingle === 'boolean' ? initialBlogSidebarSettings.enabledSingle : initialBlogSidebarSettings.enabled
  );
  const archiveVal = (initialBlogSidebarSettings as { enabledArchive?: unknown }).enabledArchive;
  const [blogSidebarEnabledArchive, setBlogSidebarEnabledArchive] = useState<boolean>(
    typeof archiveVal === 'boolean'
      ? archiveVal
      : (typeof initialBlogSidebarSettings.enabledIndex === 'boolean' ? initialBlogSidebarSettings.enabledIndex : initialBlogSidebarSettings.enabled)
  );
  const [blogSidebarEnabledPages, setBlogSidebarEnabledPages] = useState<boolean>(
    typeof initialBlogSidebarSettings.enabledPages === 'boolean' ? initialBlogSidebarSettings.enabledPages : initialBlogSidebarSettings.enabled
  );
  const [blogSidebarShowRecent, setBlogSidebarShowRecent] = useState<boolean>(!!initialBlogSidebarSettings.showRecent);
  const [blogSidebarRecentCount, setBlogSidebarRecentCount] = useState<number>(initialBlogSidebarSettings.recentCount || 5);
  const [blogSidebarContent, setBlogSidebarContent] = useState<string>(initialBlogSidebarSettings.content ?? '');
  const [blogSidebarHtml, setBlogSidebarHtml] = useState<string>(initialBlogSidebarSettings.html ?? '');
  const [blogHtmlBeforeFirst, setBlogHtmlBeforeFirst] = useState<string>(initialBlogHtmlBeforeFirst ?? '');
  const [blogHtmlMiddle, setBlogHtmlMiddle] = useState<string>(initialBlogHtmlMiddle ?? '');
  const [blogHtmlAfterLast, setBlogHtmlAfterLast] = useState<string>(initialBlogHtmlAfterLast ?? '');
  // Mark legacy per-area blog sidebar state as used to avoid lint warnings.
  void blogSidebarShowRecent;
  void blogSidebarRecentCount;
  void blogSidebarContent;
  void blogSidebarHtml;
  const [sidebarWidgets, setSidebarWidgets] = useState<BlogSidebarWidget[]>(() => {
    const widgets: BlogSidebarWidget[] = [];

    // Build enabled map from legacy settings
    const enabledMap: Record<string, { enabled: boolean; settings: BlogSidebarWidget['settings'] }> = {
      'recent-posts': { enabled: !!initialBlogSidebarSettings.showRecent, settings: { recentCount: initialBlogSidebarSettings.recentCount } },
      'rich-content': { enabled: !!initialBlogSidebarSettings.content, settings: { content: initialBlogSidebarSettings.content } },
      'raw-html': { enabled: !!initialBlogSidebarSettings.html, settings: { html: initialBlogSidebarSettings.html } }
    };

    // Respect saved widget order when migrating
    const defaultOrder = ['recent-posts', 'rich-content', 'raw-html'];
    const orderList = (initialBlogSidebarSettings.widgetOrder && initialBlogSidebarSettings.widgetOrder.length)
      ? initialBlogSidebarSettings.widgetOrder
      : defaultOrder;

    let orderCounter = 0;
    for (const type of orderList) {
      const meta = enabledMap[type];
      if (!meta || !meta.enabled) continue;
      widgets.push({
        id: type,
        type: type as BlogSidebarWidget['type'],
        title: type === 'recent-posts' ? 'Recent Posts' : type === 'rich-content' ? 'Rich Content' : 'Custom HTML',
        enabled: true,
        order: orderCounter++,
        settings: meta.settings
      });
    }

    return widgets.sort((a, b) => a.order - b.order);
  });
  
  // Layout state
  const [pricingMaxColumns, setPricingMaxColumns] = useState(initialPricingSettings.maxColumns);
  const [pricingCenterUneven, setPricingCenterUneven] = useState(initialPricingSettings.centerUneven);
  
  // Color state
  const [lightColors, setLightColors] = useState<ColorTokens>(
    initialColorPalette?.light ?? DEFAULT_LIGHT_COLORS
  );
  const [darkColors, setDarkColors] = useState<ColorTokens>(
    initialColorPalette?.dark ?? DEFAULT_DARK_COLORS
  );
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');

  // Keep the runtime CSS vars in sync while editing, and
  // re-apply on tab switches in case the head gets reconciled.
  useEffect(() => {
    applyPaletteToDocument({ light: lightColors, dark: darkColors });
  }, [applyPaletteToDocument, lightColors, darkColors, activeTab]);

  // Prevent unsaved preview styles from leaking after leaving /admin/theme.
  useEffect(() => {
    return () => {
      try {
        document.getElementById('runtime-theme-color-vars')?.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleSaveColorPreset = useCallback(async (name: string) => {
    const trimmed = (name || '').trim().slice(0, 48);
    if (!trimmed) return;

    const prev = colorPresets;
    const next: ThemeColorPreset[] = [
      ...prev.filter((preset) => preset.name.toLowerCase() !== trimmed.toLowerCase()),
      { name: trimmed, light: lightColors, dark: darkColors },
    ].slice(0, 25);

    setColorPresets(next);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ key: 'THEME_COLOR_PRESETS', value: JSON.stringify(next) }],
        }),
      });

      if (!response.ok) {
        setColorPresets(prev);
        showToast('Failed to save preset', 'error');
        return;
      }

      showToast('Preset saved', 'success');
    } catch (error) {
      console.error('Failed to save color preset', error);
      setColorPresets(prev);
      showToast('Failed to save preset', 'error');
    }
  }, [colorPresets, darkColors, lightColors]);

  const handleDeleteColorPreset = useCallback(async (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;

    const prev = colorPresets;
    const next = prev.filter((preset) => preset.name.toLowerCase() !== trimmed.toLowerCase());
    if (next.length === prev.length) return;

    setColorPresets(next);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ key: 'THEME_COLOR_PRESETS', value: JSON.stringify(next) }],
        }),
      });

      if (!response.ok) {
        setColorPresets(prev);
        showToast('Failed to delete preset', 'error');
        return;
      }

      showToast('Preset deleted', 'success');
    } catch (error) {
      console.error('Failed to delete color preset', error);
      setColorPresets(prev);
      showToast('Failed to delete preset', 'error');
    }
  }, [colorPresets]);
  
  // Code state
  const [customCss, setCustomCss] = useState(initialCustomCss);
  const [customHead, setCustomHead] = useState(initialCustomHead);
  const [customBody, setCustomBody] = useState(initialCustomBody);
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [blogRelatedPostsEnabled, setBlogRelatedPostsEnabled] = useState<boolean>(!!initialRelatedPostsEnabled);

  const canAddHeader = headerLinks.length < MAX_LINKS;
  const canAddFooter = footerLinks.length < MAX_LINKS;
  const footerTokenHints = useMemo(() => ['{{year}}', '{{site}}', '{{sitename}}'], []);

  const normalizeLinks = useCallback((links: ThemeLink[], sectionLabel: string) => {
    const trimmed: ThemeLink[] = [];
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      const label = link.label.trim();
      const href = link.href.trim();
      if (!label && !href) continue;
      if (!label || !href) {
        showToast(`${sectionLabel} link ${i + 1} requires both a label and URL.`, 'error');
        return null;
      }
      if (!isSafeHref(href)) {
        showToast(`${sectionLabel} link ${i + 1} must start with "/" or "http(s)://".`, 'error');
        return null;
      }
      trimmed.push({ label: label.slice(0, 64), href: href.slice(0, 2048) });
      if (trimmed.length > MAX_LINKS) {
        showToast(`Limit ${MAX_LINKS} ${sectionLabel.toLowerCase()} links.`, 'error');
        return null;
      }
    }
    return trimmed;
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;

    const normalizedHeader = normalizeLinks(headerLinks, 'Header');
    if (!normalizedHeader) return;
    const normalizedFooter = normalizeLinks(footerLinks, 'Footer');
    if (!normalizedFooter) return;

    setSaving(true);
    try {
      // Save theme settings
      const themeResponse = await fetch('/api/admin/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headerLinks: normalizedHeader,
          footerLinks: normalizedFooter,
          footerText: footerText.trim(),
          customCss,
          customHead,
          customBody,
          colorPalette: { light: lightColors, dark: darkColors },
        })
      });

      if (!themeResponse.ok) {
        const error = await themeResponse.json().catch(() => ({ error: 'Failed to save theme settings' }));
        showToast(error.error || 'Failed to save theme settings', 'error');
        return;
      }

      // Convert widgets back to legacy format for API and save widget order
      const recentWidget = sidebarWidgets.find(w => w.type === 'recent-posts' && w.enabled);
      const richContentWidget = sidebarWidgets.find(w => w.type === 'rich-content' && w.enabled);
      const htmlWidget = sidebarWidgets.find(w => w.type === 'raw-html' && w.enabled);
      
      // Create widget order string from enabled widgets
      const enabledWidgets = sidebarWidgets
        .filter(w => w.enabled)
        .sort((a, b) => a.order - b.order)
        .map(w => w.type);
      const widgetOrderString = enabledWidgets.length > 0 ? enabledWidgets.join(',') : 'recent-posts,rich-content,raw-html';

      const bulkSettingsResponse = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [
            // pricing + listing settings
            { key: 'PRICING_MAX_COLUMNS', value: pricingMaxColumns.toString() },
            { key: 'PRICING_CENTER_UNEVEN', value: pricingCenterUneven.toString() },
            { key: 'BLOG_LISTING_STYLE', value: blogListingStyle },
            { key: 'BLOG_LISTING_PAGE_SIZE', value: blogListingPageSize.toString() },
            // blog sidebar settings
            { key: 'BLOG_SIDEBAR_ENABLED_INDEX', value: blogSidebarEnabledIndex.toString() },
            { key: 'BLOG_SIDEBAR_ENABLED_ARCHIVE', value: blogSidebarEnabledArchive.toString() },
            { key: 'BLOG_SIDEBAR_ENABLED_SINGLE', value: blogSidebarEnabledSingle.toString() },
            { key: 'BLOG_SIDEBAR_ENABLED_PAGES', value: blogSidebarEnabledPages.toString() },
            { key: 'BLOG_SIDEBAR_SHOW_RECENT', value: (!!recentWidget).toString() },
            { key: 'BLOG_SIDEBAR_RECENT_COUNT', value: (recentWidget?.settings.recentCount || 5).toString() },
            { key: 'BLOG_SIDEBAR_CONTENT', value: richContentWidget?.settings.content || '' },
            { key: 'BLOG_SIDEBAR_HTML', value: htmlWidget?.settings.html || '' },
            { key: 'BLOG_SIDEBAR_WIDGET_ORDER', value: widgetOrderString },
            // HTML snippet insertion points for blog posts
            { key: 'BLOG_HTML_BEFORE_FIRST_PARAGRAPH', value: blogHtmlBeforeFirst || '' },
            { key: 'BLOG_HTML_MIDDLE_OF_POST', value: blogHtmlMiddle || '' },
            { key: 'BLOG_HTML_AFTER_LAST_PARAGRAPH', value: blogHtmlAfterLast || '' },
            { key: 'BLOG_RELATED_POSTS_ENABLED', value: blogRelatedPostsEnabled.toString() },
          ],
        })
      });

      if (!bulkSettingsResponse.ok) {
        showToast('Failed to save settings', 'error');
        return;
      }

      const themePayload = await themeResponse.json();
      setHeaderLinks(themePayload.headerLinks.length ? themePayload.headerLinks : [emptyLink()]);
      setFooterLinks(themePayload.footerLinks.length ? themePayload.footerLinks : [emptyLink()]);
      setFooterText(themePayload.footerText ?? '');
      setCustomCss(themePayload.customCss ?? '');
      setCustomHead(themePayload.customHead ?? '');
      setCustomBody(themePayload.customBody ?? themePayload.legacySnippet ?? '');
      if (themePayload.colorPalette) {
        const merged: ThemeColorPalette = {
          light: themePayload.colorPalette.light ?? DEFAULT_LIGHT_COLORS,
          dark: themePayload.colorPalette.dark ?? DEFAULT_DARK_COLORS,
        };
        setLightColors(merged.light);
        setDarkColors(merged.dark);
        applyPaletteToDocument(merged);
      }
      showToast('Theme settings saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save settings', error);
      showToast('Unexpected error saving settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    saving, headerLinks, footerLinks, footerText, customCss, customHead, customBody,
    normalizeLinks, pricingMaxColumns, pricingCenterUneven, blogListingStyle,
    blogListingPageSize, blogSidebarEnabledIndex, blogSidebarEnabledSingle,
    blogSidebarEnabledArchive, blogSidebarEnabledPages, sidebarWidgets,
    blogRelatedPostsEnabled, blogHtmlBeforeFirst, blogHtmlMiddle, blogHtmlAfterLast,
    lightColors, darkColors,
    applyPaletteToDocument,
  ]);

  const handleReset = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const response = await fetch('/api/admin/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to reset theme settings' }));
        showToast(error.error || 'Failed to reset theme settings', 'error');
        return;
      }

      const payload = await response.json();
      setHeaderLinks(payload.headerLinks.length ? payload.headerLinks : [emptyLink()]);
      setFooterLinks(payload.footerLinks.length ? payload.footerLinks : [emptyLink()]);
      setFooterText(payload.footerText ?? '');
      setCustomCss(payload.customCss ?? '');
      setCustomHead(payload.customHead ?? '');
      setCustomBody(payload.customBody ?? payload.legacySnippet ?? '');
      setLightColors(payload.colorPalette?.light ?? DEFAULT_LIGHT_COLORS);
      setDarkColors(payload.colorPalette?.dark ?? DEFAULT_DARK_COLORS);
      applyPaletteToDocument({
        light: payload.colorPalette?.light ?? DEFAULT_LIGHT_COLORS,
        dark: payload.colorPalette?.dark ?? DEFAULT_DARK_COLORS,
      });
      showToast('Theme settings restored to defaults', 'success');
      // Refresh blog sidebar + related posts settings from server defaults
      try {
        const keys = [
          'BLOG_SIDEBAR_ENABLED_INDEX',
          'BLOG_SIDEBAR_ENABLED_ARCHIVE',
          'BLOG_SIDEBAR_ENABLED_SINGLE',
          'BLOG_SIDEBAR_ENABLED_PAGES',
          'BLOG_SIDEBAR_SHOW_RECENT',
          'BLOG_SIDEBAR_RECENT_COUNT',
          'BLOG_SIDEBAR_CONTENT',
          'BLOG_SIDEBAR_HTML',
          'BLOG_HTML_BEFORE_FIRST_PARAGRAPH',
          'BLOG_HTML_MIDDLE_OF_POST',
          'BLOG_HTML_AFTER_LAST_PARAGRAPH',
          'BLOG_RELATED_POSTS_ENABLED'
        ];
        const responses = await Promise.all(keys.map(k => fetch(`/api/admin/settings?key=${encodeURIComponent(k)}`)));
        const ok = responses.every(r => r.ok);
        if (ok) {
          const results = await Promise.all(responses.map(r => r.json()));
          const map: Record<string, string> = {};
          for (const item of results) {
            if (item && typeof item.key === 'string') map[item.key] = item.value ?? '';
          }
          setBlogSidebarEnabledIndex(map.BLOG_SIDEBAR_ENABLED_INDEX === 'true');
          setBlogSidebarEnabledArchive(map.BLOG_SIDEBAR_ENABLED_ARCHIVE === 'true');
          setBlogSidebarEnabledSingle(map.BLOG_SIDEBAR_ENABLED_SINGLE === 'true');
          setBlogSidebarEnabledPages(map.BLOG_SIDEBAR_ENABLED_PAGES === 'true');
          setBlogSidebarShowRecent(map.BLOG_SIDEBAR_SHOW_RECENT === 'true');
          setBlogSidebarRecentCount(parseInt(map.BLOG_SIDEBAR_RECENT_COUNT || '5', 10) || 5);
          setBlogSidebarContent(map.BLOG_SIDEBAR_CONTENT ?? '');
          setBlogSidebarHtml(map.BLOG_SIDEBAR_HTML ?? '');
          setBlogHtmlBeforeFirst(map.BLOG_HTML_BEFORE_FIRST_PARAGRAPH ?? '');
          setBlogHtmlMiddle(map.BLOG_HTML_MIDDLE_OF_POST ?? '');
          setBlogHtmlAfterLast(map.BLOG_HTML_AFTER_LAST_PARAGRAPH ?? '');
          setBlogRelatedPostsEnabled(map.BLOG_RELATED_POSTS_ENABLED === 'true');
        }
      } catch (err) {
        console.warn('Failed to refresh blog sidebar defaults after reset', err);
      }
    } catch (error) {
      console.error('Failed to reset theme settings', error);
      showToast('Unexpected error resetting theme settings', 'error');
    } finally {
      setResetting(false);
    }
  }, [resetting]);

  // Navigation helpers
  const updateHeaderLink = useCallback((index: number, field: keyof ThemeLink, value: string) => {
    setHeaderLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const updateFooterLink = useCallback((index: number, field: keyof ThemeLink, value: string) => {
    setFooterLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const removeHeaderLink = useCallback((index: number) => {
    setHeaderLinks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyLink()];
    });
  }, []);

  const removeFooterLink = useCallback((index: number) => {
    setFooterLinks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyLink()];
    });
  }, []);

  const addHeaderLink = useCallback(() => {
    setHeaderLinks((prev) => (prev.length >= MAX_LINKS ? prev : [...prev, emptyLink()]));
  }, []);

  const addFooterLink = useCallback(() => {
    setFooterLinks((prev) => (prev.length >= MAX_LINKS ? prev : [...prev, emptyLink()]));
  }, []);

  // Widget management helpers
  const addWidget = useCallback((type: BlogSidebarWidget['type']) => {
    const newWidget: BlogSidebarWidget = {
      id: `${type}-${Date.now()}`,
      type,
      title: type === 'recent-posts' ? 'Recent Posts' : type === 'rich-content' ? 'Rich Content' : 'Custom HTML',
      enabled: true,
      order: sidebarWidgets.length,
      settings: type === 'recent-posts' ? { recentCount: 5 } : type === 'rich-content' ? { content: '' } : { html: '' }
    };
    setSidebarWidgets(prev => [...prev, newWidget].sort((a, b) => a.order - b.order));
  }, [sidebarWidgets.length]);

  const removeWidget = useCallback((id: string) => {
    setSidebarWidgets(prev => prev.filter(w => w.id !== id).map((w, index) => ({ ...w, order: index })));
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setSidebarWidgets(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  }, []);

  const updateWidgetSettings = useCallback((id: string, settings: Partial<BlogSidebarWidget['settings']>) => {
    setSidebarWidgets(prev => prev.map(w => w.id === id ? { ...w, settings: { ...w.settings, ...settings } } : w));
  }, []);

  const updateWidgetTitle = useCallback((id: string, title: string) => {
    setSidebarWidgets(prev => prev.map(w => w.id === id ? { ...w, title } : w));
  }, []);

  const moveWidget = useCallback((id: string, direction: 'up' | 'down') => {
    setSidebarWidgets(prev => {
      const widgets = [...prev];
      const currentIndex = widgets.findIndex(w => w.id === id);
      if (currentIndex === -1) return prev;
      
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= widgets.length) return prev;
      
      // Swap widgets
      [widgets[currentIndex], widgets[targetIndex]] = [widgets[targetIndex], widgets[currentIndex]];
      
      // Update order values
      return widgets.map((w, index) => ({ ...w, order: index }));
    });
  }, []);

  const canMoveUp = useCallback((id: string) => {
    const index = sidebarWidgets.findIndex(w => w.id === id);
    return index > 0;
  }, [sidebarWidgets]);

  const canMoveDown = useCallback((id: string) => {
    const index = sidebarWidgets.findIndex(w => w.id === id);
    return index >= 0 && index < sidebarWidgets.length - 1;
  }, [sidebarWidgets]);

  const tabs = useMemo(() => [
    {
      id: 'navigation',
      label: 'Navigation',
      icon: faCompass,
      description: 'Header and footer links, site messaging',
      content: (
        <div className="space-y-8">
          {/* Header Links */}
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
                  <FontAwesomeIcon icon={faCompass} className="h-5 w-5" />
                  <div>Header Navigation</div>
                </div>
                <p className="text-sm text-slate-600 dark:text-neutral-400">Control the primary links shown in the top navigation bar.</p>
              </div>
              <button
                type="button"
                onClick={addHeaderLink}
                disabled={!canAddHeader}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
              >
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                Add link
              </button>
            </div>
            <div className="space-y-4">
              {headerLinks.map((link, index) => (
                <div
                  key={`header-link-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/60"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex-1 space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Label</label>
                      <input
                        type="text"
                        value={link.label}
                        onChange={(event) => updateHeaderLink(index, 'label', event.target.value)}
                        placeholder="Dashboard"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">URL</label>
                      <input
                        type="text"
                        value={link.href}
                        onChange={(event) => updateHeaderLink(index, 'href', event.target.value)}
                        placeholder="/dashboard"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                    <div className="flex items-center justify-end md:justify-center">
                      <button
                        type="button"
                        onClick={() => removeHeaderLink(index)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Footer Links */}
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
                  <FontAwesomeIcon icon={faLink} className="h-5 w-5" />
                  <div>Footer Layout</div>
                </div>
                <p className="text-sm text-slate-600 dark:text-neutral-400">
                  Configure footer links and display text. Use tokens like {'{{year}}'} and {'{{site}}'}.
                </p>
              </div>
              <button
                type="button"
                onClick={addFooterLink}
                disabled={!canAddFooter}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
              >
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                Add footer link
              </button>
            </div>
            <div className="space-y-4">
              {footerLinks.map((link, index) => (
                <div
                  key={`footer-link-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/60"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex-1 space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Label</label>
                      <input
                        type="text"
                        value={link.label}
                        onChange={(event) => updateFooterLink(index, 'label', event.target.value)}
                        placeholder="Privacy"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">URL</label>
                      <input
                        type="text"
                        value={link.href}
                        onChange={(event) => updateFooterLink(index, 'href', event.target.value)}
                        placeholder="/privacy"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                    <div className="flex items-center justify-end md:justify-center">
                      <button
                        type="button"
                        onClick={() => removeFooterLink(index)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-2">
              <label className="block text-sm font-semibold text-slate-900 dark:text-neutral-100">Footer text</label>
              <textarea
                value={footerText}
                onChange={(event) => setFooterText(event.target.value)}
                rows={3}
                placeholder="© {{year}} {{siteName}}. All rights reserved."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <p className="text-xs text-slate-500 dark:text-neutral-500">Supports tokens {footerTokenHints.join(', ')}.</p>
            </div>
          </section>
        </div>
      )
    },
    {
      id: 'content',
      label: 'Content',
      icon: faNewspaper,
      description: 'Blog listings and sidebar configuration',
      content: (
        <div className="space-y-8">
          {/* Blog Listing Style */}
          <section>
            <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
              <FontAwesomeIcon icon={faTableCells} className="h-5 w-5" />
              <div>Blog Listing Style</div>
            </div>
            <p className="text-sm text-slate-600 dark:text-neutral-400 mb-6">
              Configure how your blog listing page appears to visitors.
            </p>
            <div className="space-y-3">
              <label htmlFor="blog-listing-style" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
                Blog listing style
              </label>
              <select
                id="blog-listing-style"
                value={blogListingStyle}
                onChange={(e) => setBlogListingStyle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="simple">Simple List - Clean and minimal cards</option>
                <option value="grid">Grid - Card layout with featured images</option>
                <option value="magazine">Magazine - Featured post with sidebar</option>
                <option value="minimal">Minimal - Typography-focused design</option>
                <option value="timeline">Timeline - Chronological layout</option>
                <option value="classic">Classic - Traditional layout with left thumbnails</option>
              </select>
              <p className="text-xs text-slate-500 dark:text-neutral-500">
                Choose how your blog posts are displayed on the /blog page. Styles that support images will use social image URLs from your posts.
              </p>
              <div className="mt-3">
                <label htmlFor="blog-listing-page-size" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Posts per page</label>
                <input
                  id="blog-listing-page-size"
                  type="number"
                  min={1}
                  max={50}
                  value={blogListingPageSize}
                  onChange={(e) => setBlogListingPageSize(Math.max(1, Math.min(50, parseInt(e.target.value || '10', 10))))}
                  className="mt-1 w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-500 mt-1">Controls how many posts appear per page on the blog listing.</p>
              </div>
            </div>
          </section>
          
          {/* Blog Sidebar */}
          <section>
            <div className="mb-6">
              <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
                <FontAwesomeIcon icon={faNewspaper} className="h-5 w-5" />
                <div>Blog Sidebar & Related Posts</div>
              </div>
              <p className="text-sm text-slate-600 dark:text-neutral-400">
                Configure where sidebars appear and enable related posts. Manage sidebar widgets below.
              </p>
              
              {/* Settings Controls */}
              <div className="mt-4 rounded-lg border border-slate-200 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-800/50 p-4">
                <h4 className="text-sm font-medium text-slate-900 dark:text-neutral-100 mb-3">Display Settings</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      id="blog-sidebar-enabled-index"
                      type="checkbox"
                      checked={blogSidebarEnabledIndex}
                      onChange={(e) => setBlogSidebarEnabledIndex(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                    />
                    <div>
                      <label htmlFor="blog-sidebar-enabled-index" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                        Enable sidebar on blog listing
                      </label>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on the main blog page (/blog)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <input
                      id="blog-sidebar-enabled-single"
                      type="checkbox"
                      checked={blogSidebarEnabledSingle}
                      onChange={(e) => setBlogSidebarEnabledSingle(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                    />
                    <div>
                      <label htmlFor="blog-sidebar-enabled-single" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                        Enable sidebar on single posts
                      </label>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on individual blog posts (/blog/post-name)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <input
                      id="blog-sidebar-enabled-archive"
                      type="checkbox"
                      checked={blogSidebarEnabledArchive}
                      onChange={(e) => setBlogSidebarEnabledArchive(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                    />
                    <div>
                      <label htmlFor="blog-sidebar-enabled-archive" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                        Enable sidebar on archive pages
                      </label>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on category pages (/blog/category/name)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <input
                      id="blog-sidebar-enabled-pages"
                      type="checkbox"
                      checked={blogSidebarEnabledPages}
                      onChange={(e) => setBlogSidebarEnabledPages(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                    />
                    <div>
                      <label htmlFor="blog-sidebar-enabled-pages" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                        Enable sidebar on generic pages
                      </label>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on content pages (/privacy, /terms, etc.)</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-neutral-600">
                    <div className="flex items-start gap-3">
                      <input
                        id="blog-related-posts-enabled"
                        type="checkbox"
                        checked={blogRelatedPostsEnabled}
                        onChange={(e) => setBlogRelatedPostsEnabled(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                      />
                      <div>
                        <label htmlFor="blog-related-posts-enabled" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                          Show related posts under blog articles
                        </label>
                        <p className="text-xs text-slate-500 dark:text-neutral-400">Displays up to 4 related posts at the bottom of each blog post</p>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-slate-900 dark:text-neutral-100 mb-2">HTML Snippets (Blog posts)</h4>
                      <p className="text-xs text-slate-500 dark:text-neutral-400 mb-3">Insert custom HTML snippets into blog posts. Use responsibly — this HTML is rendered as-is.</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300">Before first paragraph</label>
                          <textarea
                            value={blogHtmlBeforeFirst}
                            onChange={(e) => setBlogHtmlBeforeFirst(e.target.value)}
                            rows={3}
                            placeholder="<div class='promo'>Signup now</div>"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300">Insert in the middle of the post</label>
                          <textarea
                            value={blogHtmlMiddle}
                            onChange={(e) => setBlogHtmlMiddle(e.target.value)}
                            rows={3}
                            placeholder="<div class='ad'>Ad code</div>"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300">After last paragraph</label>
                          <textarea
                            value={blogHtmlAfterLast}
                            onChange={(e) => setBlogHtmlAfterLast(e.target.value)}
                            rows={3}
                            placeholder="<div class='related-cta'>More posts</div>"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {(blogSidebarEnabledIndex || blogSidebarEnabledSingle || blogSidebarEnabledArchive || blogSidebarEnabledPages) && (
              <div className="space-y-6">
                {/* Widget Creation */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-700 dark:bg-blue-900/20">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Add New Widget</h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300">Choose a widget type to add to your blog sidebar.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addWidget('recent-posts')}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
                        Recent Posts
                      </button>
                      <button
                        type="button"
                        onClick={() => addWidget('rich-content')}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
                      >
                        <FontAwesomeIcon icon={faFileText} className="h-3 w-3" />
                        Rich Content
                      </button>
                      <button
                        type="button"
                        onClick={() => addWidget('raw-html')}
                        className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                      >
                        <FontAwesomeIcon icon={faCode} className="h-3 w-3" />
                        Custom HTML
                      </button>
                    </div>
                  </div>
                </div>

                {/* Widget List */}
                {sidebarWidgets.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-neutral-700 dark:bg-neutral-900/60">
                    <FontAwesomeIcon icon={faNewspaper} className="h-12 w-12 text-slate-400 dark:text-neutral-500 mb-3" />
                    <p className="text-lg font-medium text-slate-900 dark:text-neutral-100 mb-1">No widgets yet</p>
                    <p className="text-sm text-slate-600 dark:text-neutral-400">Add your first widget to get started with your blog sidebar.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sidebarWidgets.map((widget, index) => (
                      <div
                        key={widget.id}
                        className={cx(
                          'rounded-xl border p-4 transition-all',
                          widget.enabled
                            ? 'border-slate-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900'
                            : 'border-slate-200 bg-slate-50 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/60'
                        )}
                      >
                        <div className="space-y-4">
                          {/* Widget Header */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-400">
                              <FontAwesomeIcon icon={faGripVertical} className="h-4 w-4" />
                              <span className="text-xs font-medium">#{index + 1}</span>
                            </div>
                            <div className="flex-1">
                              <input
                                type="text"
                                value={widget.title}
                                onChange={(e) => updateWidgetTitle(widget.id, e.target.value)}
                                className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 dark:text-neutral-100 dark:focus:bg-neutral-800"
                                placeholder="Widget title"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => moveWidget(widget.id, 'up')}
                                disabled={!canMoveUp(widget.id)}
                                className="rounded-md p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed dark:text-neutral-500 dark:hover:text-neutral-300"
                              >
                                <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveWidget(widget.id, 'down')}
                                disabled={!canMoveDown(widget.id)}
                                className="rounded-md p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed dark:text-neutral-500 dark:hover:text-neutral-300"
                              >
                                <FontAwesomeIcon icon={faArrowDown} className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleWidget(widget.id)}
                                className={cx(
                                  'rounded-md p-1 transition-colors',
                                  widget.enabled
                                    ? 'text-green-600 hover:text-green-700 dark:text-green-400'
                                    : 'text-slate-400 hover:text-slate-600 dark:text-neutral-500'
                                )}
                              >
                                <FontAwesomeIcon icon={widget.enabled ? faEye : faEyeSlash} className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeWidget(widget.id)}
                                className="rounded-md p-1 text-rose-400 hover:text-rose-600 dark:text-rose-500 dark:hover:text-rose-400"
                              >
                                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {/* Widget Settings */}
                          {widget.enabled && (
                            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/60">
                              {widget.type === 'recent-posts' && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
                                    Recent Posts Settings
                                  </div>
                                  <div className="space-y-2">
                                    <label className="block text-xs font-medium text-slate-900 dark:text-neutral-100">
                                      Number of posts to show
                                    </label>
                                    <select
                                      value={widget.settings.recentCount || 5}
                                      onChange={(e) => updateWidgetSettings(widget.id, { recentCount: parseInt(e.target.value, 10) })}
                                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
                                    >
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                        <option key={num} value={num}>{num} post{num === 1 ? '' : 's'}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}
                              
                              {widget.type === 'rich-content' && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    <FontAwesomeIcon icon={faFileText} className="h-3 w-3" />
                                    Rich Content Editor
                                  </div>
                                  <SimplePageEditor
                                    value={widget.settings.content || ''}
                                    onChange={(content) => updateWidgetSettings(widget.id, { content })}
                                    placeholder="Create rich content for your sidebar..."
                                  />
                                </div>
                              )}
                              
                              {widget.type === 'raw-html' && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                    <FontAwesomeIcon icon={faCode} className="h-3 w-3" />
                                    Custom HTML Code
                                  </div>
                                  <textarea
                                    value={widget.settings.html || ''}
                                    onChange={(e) => updateWidgetSettings(widget.id, { html: e.target.value })}
                                    rows={4}
                                    placeholder="<div>Custom HTML content...</div>"
                                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
                                  />
                                  <p className="text-xs text-slate-500 dark:text-neutral-500">
                                    Raw HTML will be inserted directly into the sidebar. Use with caution.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )
    },
    {
      id: 'colors',
      label: 'Colors',
      icon: faPalette,
      description: 'Brand colors, backgrounds, and accents for light and dark mode',
      content: (
        <ColorTabContent
          lightColors={lightColors}
          darkColors={darkColors}
          colorMode={colorMode}
          onColorMode={setColorMode}
          onLightChange={setLightColors}
          onDarkChange={setDarkColors}
          customPresets={colorPresets}
          onSavePreset={handleSaveColorPreset}
          onDeletePreset={handleDeleteColorPreset}
        />
      )
    },
    {
      id: 'layout',
      label: 'Layout',
      icon: faTableCells,
      description: 'Pricing cards and page structure',
      content: (
        <div className="space-y-8">
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
                    : `Cards will be arranged in up to ${pricingMaxColumns} column${pricingMaxColumns === 1 ? '' : 's'} maximum.`
                  }
                </p>
              </div>
              <div className="space-y-3">
                <label htmlFor="pricing-center-uneven" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
                  Center uneven rows
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
                    : 'Cards will always be left-aligned regardless of count.'
                  }
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xl font-semibold text-slate-900 dark:text-neutral-50">Header & Background</div>
                <p className="text-sm text-slate-600 dark:text-neutral-300">Adjust header, sidebar, content area, and backdrop glow styling for light and dark mode.</p>
              </div>
              <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-neutral-700 dark:bg-neutral-900">
                {(['light', 'dark'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={colorMode === m}
                    onClick={() => setColorMode(m)}
                    className={cx(
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                      colorMode === m
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-100',
                    )}
                  >
                    {m === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Presets</div>
              <div className="flex flex-wrap gap-3">
                {(() => {
                  const colors = colorMode === 'light' ? lightColors : darkColors;
                  const setColors = colorMode === 'light' ? setLightColors : setDarkColors;
                  const builtInPresets = colorMode === 'light' ? LIGHT_PRESETS : DARK_PRESETS;
                  const custom = colorPresets.map((preset) => {
                    const modeColors = colorMode === 'light' ? preset.light : preset.dark;
                    return { name: preset.name, accent: modeColors.accentPrimary, colors: fillElementGradients(modeColors) };
                  });
                  const presets = [
                    ...builtInPresets.map((p) => ({ ...p, colors: fillElementGradients(p.colors) })),
                    ...custom
                  ];
                  const layoutStringKeys = [
                    'headerBg',
                    'sidebarBg',
                    'pageGradientFrom',
                    'pageGradientVia',
                    'pageGradientTo',
                    'pageGlow',
                  ] as const;
                  const layoutNumberKeys = ['headerOpacity', 'sidebarOpacity', 'glowOpacity'] as const;
                  const layoutKeys = [...layoutStringKeys, ...layoutNumberKeys] as const;

                  const isActive = (preset: ColorTokens) => layoutKeys.every((k) => colors[k] === preset[k]);

                  return presets.map((preset) => {
                    const active = isActive(preset.colors);
                    return (
                      <button
                        key={`${colorMode}-${preset.name}`}
                        type="button"
                        onClick={() => {
                          setColors({
                            ...colors,
                            headerBg: preset.colors.headerBg,
                            headerOpacity: preset.colors.headerOpacity,
                            sidebarBg: preset.colors.sidebarBg,
                            sidebarOpacity: preset.colors.sidebarOpacity,
                            pageGradientFrom: preset.colors.pageGradientFrom,
                            pageGradientVia: preset.colors.pageGradientVia,
                            pageGradientTo: preset.colors.pageGradientTo,
                            pageGlow: preset.colors.pageGlow,
                            glowOpacity: preset.colors.glowOpacity,
                          });
                        }}
                        className={cx(
                          'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all',
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-inner dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
                        )}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.accent }} />
                        {preset.name}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {(() => {
                const colors = colorMode === 'light' ? lightColors : darkColors;
                const setColors = colorMode === 'light' ? setLightColors : setDarkColors;
                const update = (key: ColorHexKey, value: string) => setColors({ ...colors, [key]: value });

                const fields: Array<{ key: ColorHexKey; label: string }> = [
                  { key: 'headerBg', label: 'Header background' },
                  { key: 'sidebarBg', label: 'Sidebar background' },
                  { key: 'pageGradientFrom', label: 'Content area (from)' },
                  { key: 'pageGradientVia', label: 'Content area (via)' },
                  { key: 'pageGradientTo', label: 'Content area (to)' },
                  { key: 'pageGlow', label: 'Backdrop glow accent' },
                ];

                return fields.map((f) => (
                  <div key={`${colorMode}-${String(f.key)}`} className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">{f.label}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={colors[f.key]}
                        onChange={(e) => update(f.key, e.target.value)}
                        className="h-10 w-12 rounded-lg border border-slate-300 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                      <input
                        type="text"
                        value={colors[f.key]}
                        onChange={(e) => update(f.key, e.target.value)}
                        placeholder="#rrggbb"
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {(() => {
                const colors = colorMode === 'light' ? lightColors : darkColors;
                const setColors = colorMode === 'light' ? setLightColors : setDarkColors;
                const updateOpacityPercent = (key: OpacityKey, percent: number) => {
                  const clamped = Math.max(0, Math.min(100, percent));
                  const next = Math.round(clamped) / 100;
                  setColors({ ...colors, [key]: next });
                };

                const opacityFields: Array<{ key: OpacityKey; label: string }> = [
                  { key: 'headerOpacity', label: 'Header opacity' },
                  { key: 'sidebarOpacity', label: 'Sidebar opacity' },
                  { key: 'glowOpacity', label: 'Backdrop glow opacity' },
                ];

                return opacityFields.map((f) => (
                  <div key={`${colorMode}-${f.key}`} className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">{f.label}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round((colors[f.key] ?? 0) * 100)}
                        onChange={(e) => updateOpacityPercent(f.key, Number(e.target.value))}
                        className="h-2 w-full flex-1 cursor-pointer"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round((colors[f.key] ?? 0) * 100)}
                        onChange={(e) => updateOpacityPercent(f.key, Number(e.target.value))}
                        className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                        aria-label={`${f.label} percent`}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </section>
        </div>
      )
    },
    {
      id: 'code',
      label: 'Code',
      icon: faCode,
      description: 'Custom CSS, HTML head, and body snippets',
      content: (
        <div className="space-y-8">
          <section className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-neutral-50">
                <FontAwesomeIcon icon={faLink} className="h-4 w-4" />
                Custom CSS
              </div>
              <textarea
                value={customCss}
                onChange={(event) => setCustomCss(event.target.value)}
                rows={8}
                placeholder="/* Paste custom CSS */"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <p className="text-xs text-slate-500 dark:text-neutral-500">Injected directly into the &lt;head&gt;. Keep it lightweight.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-neutral-50">
                  <FontAwesomeIcon icon={faCode} className="h-4 w-4" />
                  Custom head markup
                </div>
                <textarea
                  value={customHead}
                  onChange={(event) => setCustomHead(event.target.value)}
                  rows={6}
                  placeholder={'<meta name="robots" content="noindex" />\n<script>/* analytics */</script>'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-500">Rendered before &lt;/head&gt; closes. Ideal for meta tags, analytics, or preload hints.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-neutral-50">
                  <FontAwesomeIcon icon={faCode} className="h-4 w-4" />
                  Custom body markup
                </div>
                <textarea
                  value={customBody}
                  onChange={(event) => setCustomBody(event.target.value)}
                  rows={6}
                  placeholder={'<script src="https://example.com/widget.js" defer></script>'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-500">Appended just before &lt;/body&gt;. Great for chat widgets, monitoring, or conversion tracking.</p>
              </div>
            </div>
          </section>
        </div>
      )
    }
  ], [
    headerLinks, footerLinks, footerText, canAddHeader, canAddFooter, footerTokenHints,
    addHeaderLink, addFooterLink, updateHeaderLink, updateFooterLink, removeHeaderLink, removeFooterLink,
    blogListingStyle, blogListingPageSize, blogSidebarEnabledIndex, blogSidebarEnabledSingle,
    blogSidebarEnabledArchive, blogSidebarEnabledPages, blogRelatedPostsEnabled,
    sidebarWidgets, setBlogListingStyle, setBlogSidebarEnabledIndex, setBlogSidebarEnabledSingle,
    setBlogSidebarEnabledArchive, setBlogSidebarEnabledPages, setBlogRelatedPostsEnabled,
    addWidget, removeWidget, toggleWidget, updateWidgetSettings, updateWidgetTitle, moveWidget, canMoveUp, canMoveDown,
    pricingMaxColumns, pricingCenterUneven, setPricingMaxColumns, setPricingCenterUneven,
    customCss, customHead, customBody, setCustomCss, setCustomHead, setCustomBody,
    blogHtmlBeforeFirst, blogHtmlMiddle, blogHtmlAfterLast,
    lightColors, darkColors, colorMode, setColorMode,
  ]);

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div
        className="relative flex overflow-hidden rounded-2xl border border-[rgb(var(--accent-primary)_/_0.25)] bg-[linear-gradient(135deg,var(--theme-tabs-gradient-from),var(--theme-tabs-gradient-via),var(--theme-tabs-gradient-to))] shadow-[0_12px_45px_rgb(var(--accent-primary)_/_0.12)] transition-shadow dark:border-[rgb(var(--accent-primary)_/_0.35)] dark:shadow-[0_0_40px_rgb(var(--accent-primary)_/_0.18)]"
        role="tablist"
        aria-label="Theme settings sections"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary)_/_0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary)_/_0.28),_transparent_60%)]" />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              'relative z-10 flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-white text-[rgb(var(--accent-primary))] shadow-md dark:bg-black dark:text-[rgb(var(--accent-primary))]'
                : 'text-slate-700/85 hover:bg-white/60 hover:text-slate-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-neutral-50'
            )}
          >
            <FontAwesomeIcon icon={tab.icon} className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${activeContent.id}-tab`}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-neutral-800 dark:bg-neutral-950/60"
      >
        {activeContent.content}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <FontAwesomeIcon icon={faArrowRotateLeft} className="h-4 w-4" />
          {resetting ? 'Resetting…' : 'Restore defaults'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-emerald-500/40"
        >
          <FontAwesomeIcon icon={faFloppyDisk} className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}