"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ThemeLink } from '../../../lib/settings';
import { showToast } from '../../ui/Toast';
import { ConfirmModal } from '../../ui/ConfirmModal';
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
  | 'headerText'
  | 'headerBorder'
  | 'stickyHeaderBg'
  | 'stickyHeaderText'
  | 'stickyHeaderBorder'
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

type OpacityKey = 'headerOpacity' | 'sidebarOpacity' | 'glowOpacity' | 'headerBorderOpacity' | 'stickyHeaderBorderOpacity';

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
  headerText: string;
  headerBlur: number;
  headerBorder: string;
  headerBorderOpacity: number;
  headerBorderWidth: number;
  stickyHeaderBg: string;
  stickyHeaderOpacity: number;
  stickyHeaderBlur: number;
  stickyHeaderText: string;
  stickyHeaderBorder: string;
  stickyHeaderBorderOpacity: number;
  stickyHeaderBorderWidth: number;
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

type OptionalPresetKeys =
  | ElementGradientKeys
  | 'headerText'
  | 'headerBlur'
  | 'headerBorder'
  | 'headerBorderOpacity'
  | 'headerBorderWidth'
  | 'stickyHeaderBg'
  | 'stickyHeaderOpacity'
  | 'stickyHeaderBlur'
  | 'stickyHeaderText'
  | 'stickyHeaderBorder'
  | 'stickyHeaderBorderOpacity'
  | 'stickyHeaderBorderWidth';

type PartialColorTokens = Omit<ColorTokens, OptionalPresetKeys> & Partial<Pick<ColorTokens, OptionalPresetKeys>>;

const fillElementGradients = (t: PartialColorTokens): ColorTokens => {
  return {
    ...(t as Omit<ColorTokens, ElementGradientKeys>),
    headerText: t.headerText ?? t.textPrimary,
    headerBlur: typeof t.headerBlur === 'number' ? t.headerBlur : 12,
    headerBorder: t.headerBorder ?? t.borderPrimary,
    headerBorderOpacity: typeof t.headerBorderOpacity === 'number' ? t.headerBorderOpacity : 1,
    headerBorderWidth: typeof t.headerBorderWidth === 'number' ? t.headerBorderWidth : 1,
    stickyHeaderBg: t.stickyHeaderBg ?? t.headerBg,
    stickyHeaderOpacity: typeof t.stickyHeaderOpacity === 'number' ? t.stickyHeaderOpacity : 1,
    stickyHeaderBlur: typeof t.stickyHeaderBlur === 'number' ? t.stickyHeaderBlur : 14,
    stickyHeaderText: t.stickyHeaderText ?? t.headerText ?? t.textPrimary,
    stickyHeaderBorder: t.stickyHeaderBorder ?? t.headerBorder ?? t.borderPrimary,
    stickyHeaderBorderOpacity: typeof t.stickyHeaderBorderOpacity === 'number' ? t.stickyHeaderBorderOpacity : 1,
    stickyHeaderBorderWidth: typeof t.stickyHeaderBorderWidth === 'number' ? t.stickyHeaderBorderWidth : (typeof t.headerBorderWidth === 'number' ? t.headerBorderWidth : 1),
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
  headerBg: '#ffffffcc', headerOpacity: 1,
  headerText: '#111827', headerBlur: 12,
  headerBorder: '#d1d5dbcc', headerBorderOpacity: 1, headerBorderWidth: 1,
  stickyHeaderBg: '#ffffffeb', stickyHeaderOpacity: 1, stickyHeaderBlur: 14, stickyHeaderText: '#111827',
  stickyHeaderBorder: '#d1d5dba6', stickyHeaderBorderOpacity: 1, stickyHeaderBorderWidth: 1,
  sidebarBg: '#ffffffe6', sidebarOpacity: 1,
  pageGradientFrom: '#f0f9ff', pageGradientVia: '#eef2ff', pageGradientTo: '#ffffff',
  heroGradientFrom: '#f0f9ff', heroGradientVia: '#eef2ff', heroGradientTo: '#ffffff',
  cardGradientFrom: '#f0f9ff', cardGradientVia: '#eef2ff', cardGradientTo: '#ffffff',
  tabsGradientFrom: '#f0f9ff', tabsGradientVia: '#eef2ff', tabsGradientTo: '#ffffff',
  pageGlow: '#3b82f62e', glowOpacity: 1,
};

const DEFAULT_DARK_COLORS: ColorTokens = {
  bgPrimary: '#0a0a0a', bgSecondary: '#171717', panelBg: '#171717', heroBg: '#171717', bgTertiary: '#262626', bgQuaternary: '#404040',
  textPrimary: '#f5f5f5', textSecondary: '#a3a3a3', textTertiary: '#737373',
  borderPrimary: '#404040', borderSecondary: '#525252',
  accentPrimary: '#3b82f6', accentHover: '#2563eb',
  headerBg: '#0a0a0ab3', headerOpacity: 1,
  headerText: '#f5f5f5', headerBlur: 12,
  headerBorder: '#404040b3', headerBorderOpacity: 1, headerBorderWidth: 1,
  stickyHeaderBg: '#0a0a0ad1', stickyHeaderOpacity: 1, stickyHeaderBlur: 14, stickyHeaderText: '#f5f5f5',
  stickyHeaderBorder: '#4040408c', stickyHeaderBorderOpacity: 1, stickyHeaderBorderWidth: 1,
  sidebarBg: '#17171780', sidebarOpacity: 1,
  pageGradientFrom: '#171717', pageGradientVia: '#312e81', pageGradientTo: '#0a0a0a',
  heroGradientFrom: '#171717', heroGradientVia: '#312e81', heroGradientTo: '#0a0a0a',
  cardGradientFrom: '#171717', cardGradientVia: '#312e81', cardGradientTo: '#0a0a0a',
  tabsGradientFrom: '#171717', tabsGradientVia: '#312e81', tabsGradientTo: '#0a0a0a',
  pageGlow: '#6366f11f', glowOpacity: 1,
};

const COLOR_LABELS: Record<ColorHexKey, string> = {
  bgPrimary:       'Base background',
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
  headerText:      'Header text',
  headerBorder:    'Header border (bottom)',
  stickyHeaderBg:  'Sticky header background',
  stickyHeaderText: 'Sticky header text',
  stickyHeaderBorder: 'Sticky header border (bottom)',
  sidebarBg:       'Sidebar background',
  pageGradientFrom:'Page background (from)',
  pageGradientVia: 'Page background (via)',
  pageGradientTo:  'Page background (to)',
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
  { title: 'Header',      keys: ['headerBg', 'headerText', 'headerBorder', 'stickyHeaderBorder'] },
  { title: 'Layout',      keys: ['sidebarBg'] },
  { title: 'Page Background Gradient', keys: ['pageGradientFrom', 'pageGradientVia', 'pageGradientTo'] },
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
      headerBg: '#fffbf5cc', headerOpacity: 1,
      sidebarBg: '#fffbf5e6', sidebarOpacity: 1,
      pageGradientFrom: '#fffbf5', pageGradientVia: '#fef3dc', pageGradientTo: '#ffffff',
      pageGlow: '#f59e0b2e', glowOpacity: 1,
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
      headerBg: '#f0f9ffcc', headerOpacity: 1,
      sidebarBg: '#f0f9ffe6', sidebarOpacity: 1,
      pageGradientFrom: '#f0f9ff', pageGradientVia: '#e0f2fe', pageGradientTo: '#ffffff',
      pageGlow: '#0ea5e92e', glowOpacity: 1,
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
      headerBg: '#faf5ffcc', headerOpacity: 1,
      sidebarBg: '#faf5ffe6', sidebarOpacity: 1,
      pageGradientFrom: '#faf5ff', pageGradientVia: '#f3e8ff', pageGradientTo: '#ffffff',
      pageGlow: '#a855f72e', glowOpacity: 1,
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
      headerBg: '#f0fdf4cc', headerOpacity: 1,
      sidebarBg: '#f0fdf4e6', sidebarOpacity: 1,
      pageGradientFrom: '#f0fdf4', pageGradientVia: '#dcfce7', pageGradientTo: '#ffffff',
      pageGlow: '#22c55e2e', glowOpacity: 1,
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
      headerBg: '#fff7f7d1', headerOpacity: 1,
      sidebarBg: '#fff7f7eb', sidebarOpacity: 1,
      pageGradientFrom: '#fff7f7', pageGradientVia: '#ffe4e6', pageGradientTo: '#ffffff',
      pageGlow: '#fb71852e', glowOpacity: 1,
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
      headerBg: '#fffbebcc', headerOpacity: 1,
      sidebarBg: '#fffbebe6', sidebarOpacity: 1,
      pageGradientFrom: '#fffbeb', pageGradientVia: '#fef3c7', pageGradientTo: '#ffffff',
      pageGlow: '#f59e0b29', glowOpacity: 1,
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
      headerBg: '#020616b3', headerOpacity: 1,
      sidebarBg: '#0a162880', sidebarOpacity: 1,
      pageGradientFrom: '#020616', pageGradientVia: '#0a1628', pageGradientTo: '#020616',
      pageGlow: '#38bdf81f', glowOpacity: 1,
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
      headerBg: '#0f0a1fb3', headerOpacity: 1,
      sidebarBg: '#1a0f2e80', sidebarOpacity: 1,
      pageGradientFrom: '#0f0a1f', pageGradientVia: '#1a0f2e', pageGradientTo: '#0a0a0a',
      pageGlow: '#c084fc1f', glowOpacity: 1,
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
      headerBg: '#000000b3', headerOpacity: 1,
      sidebarBg: '#0a0a0a80', sidebarOpacity: 1,
      pageGradientFrom: '#000000', pageGradientVia: '#0a0a0a', pageGradientTo: '#000000',
      pageGlow: '#6366f11f', glowOpacity: 1,
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
      headerBg: '#071612b3', headerOpacity: 1,
      sidebarBg: '#0d261e80', sidebarOpacity: 1,
      pageGradientFrom: '#071612', pageGradientVia: '#0d261e', pageGradientTo: '#071612',
      pageGlow: '#34d3991f', glowOpacity: 1,
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
      headerBg: '#070712b8', headerOpacity: 1,
      sidebarBg: '#0b0b1485', sidebarOpacity: 1,
      pageGradientFrom: '#070712', pageGradientVia: '#131326', pageGradientTo: '#000000',
      pageGlow: '#fb718521', glowOpacity: 1,
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
  onSavePreset?: (name: string, mode: 'light' | 'dark') => Promise<boolean>;
  onDeletePreset?: (name: string) => Promise<boolean>;
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

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [savePresetLoading, setSavePresetLoading] = useState(false);

  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);
  const [deletePresetLoading, setDeletePresetLoading] = useState(false);

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

  const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
    const num = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  };

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
                setSavePresetName('');
                setSaveModalOpen(true);
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

      {/* Per-token pickers */}
      <section className="space-y-6">
        {COLOR_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">{group.title}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.keys.map((key) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                  <span className="text-sm text-slate-700 dark:text-neutral-300">{COLOR_LABELS[key]}</span>
                  <ColorPickerWithAlpha
                    value={colors[key]}
                    onChange={(v) => updateColor(key, v)}
                    label={undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Header effects */}
      <section>
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">Header</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <label className="block text-sm font-medium text-slate-900 dark:text-neutral-100">Sticky header border width (px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={4}
                step={1}
                value={clampInt(colors.stickyHeaderBorderWidth, 0, 4, 1)}
                onChange={(e) => setColors({ ...colors, stickyHeaderBorderWidth: clampInt(e.target.value, 0, 4, 1) })}
                className="h-2 w-full flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={4}
                step={1}
                value={clampInt(colors.stickyHeaderBorderWidth, 0, 4, 1)}
                onChange={(e) => setColors({ ...colors, stickyHeaderBorderWidth: clampInt(e.target.value, 0, 4, 1) })}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Sticky header border width pixels"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Applies only while sticky.</p>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
          Border colors are under the <span className="font-semibold">Header</span> group above.
        </p>
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
            style={{
              backgroundColor: colors.headerBg,
              borderBottom: `${clampInt(colors.headerBorderWidth, 0, 4, 1)}px solid ${colors.headerBorder}`,
              backdropFilter: `blur(${clampInt(colors.headerBlur, 0, 40, 12)}px)`,
            }}
          >
            {/* Brand */}
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-md flex-shrink-0" style={{ backgroundColor: colors.accentPrimary }} />
              <span className="text-xs font-bold tracking-tight" style={{ color: colors.headerText }}>SaaSyBase</span>
            </div>
            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-4">
              {['Pricing', 'Blog', 'Docs'].map((label) => (
                <span key={label} className="text-xs" style={{ color: colors.headerText }}>{label}</span>
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

interface HeaderLayoutSettings {
  style: 'right' | 'left-nav' | 'center-nav';
  height: number;
  stickyEnabled: boolean;
  stickyScrollY: number;
  stickyHeight: number;
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
  initialHeaderLayoutSettings: HeaderLayoutSettings;
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

const THEME_HEX_6_OR_8_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const THEME_HEX_EDITING_RE = /^#[0-9a-fA-F]{0,8}$/;

const hasHexAlpha = (hex: string): boolean => {
  const v = (hex || '').trim();
  return THEME_HEX_6_OR_8_RE.test(v) && v.length === 9;
};

const stripHexAlpha = (hex: string, fallback = '#000000'): string => {
  const v = (hex || '').trim();
  if (!THEME_HEX_6_OR_8_RE.test(v)) return fallback;
  return `#${v.slice(1, 7)}`;
};

const getHexAlpha01 = (hex: string): number => {
  const v = (hex || '').trim();
  if (!THEME_HEX_6_OR_8_RE.test(v)) return 1;
  if (v.length !== 9) return 1;
  const a = Number.parseInt(v.slice(7, 9), 16) / 255;
  return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
};

const setHexAlpha01 = (hex: string, alpha01: number): string => {
  const a = Math.max(0, Math.min(1, alpha01));
  const rgb6 = stripHexAlpha(hex, '#000000');
  if (a >= 0.999) {
    return hasHexAlpha(hex) ? `${rgb6}ff` : rgb6;
  }
  const aHex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `${rgb6}${aHex}`;
};

const replaceHexRgbPreserveAlpha = (existingHex: string, nextRgbHex: string): string => {
  if (!hasHexAlpha(existingHex)) return stripHexAlpha(nextRgbHex, '#000000');
  const aHex = existingHex.trim().slice(7, 9);
  return `${stripHexAlpha(nextRgbHex, stripHexAlpha(existingHex))}${aHex}`;
};

/* ── HSV ↔ RGB helpers ────────────────────────────────────── */
type HSV = { h: number; s: number; v: number };

function hexToRgb(hex: string): [number, number, number] {
  const h = stripHexAlpha(hex, '#000000').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const f = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d + 6) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = v - c;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

/* ── ColorPickerWithAlpha ─────────────────────────────────── */
function ColorPickerWithAlpha({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (hex8: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingSV = useRef(false);
  const draggingHue = useRef(false);
  const draggingAlpha = useRef(false);

  /* derive HSV + alpha from prop */
  const rgb = hexToRgb(value);
  const hsv = rgbToHsv(...rgb);
  const alpha01 = getHexAlpha01(value);

  const [localH, setLocalH] = useState(hsv.h);
  const [localS, setLocalS] = useState(hsv.s);
  const [localV, setLocalV] = useState(hsv.v);
  const [localA, setLocalA] = useState(alpha01);
  const [hexInput, setHexInput] = useState(value);

  /* sync from parent when value changes externally */
  const prevValue = useRef(value);
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      const r2 = hexToRgb(value);
      const h2 = rgbToHsv(...r2);
      setLocalH(h2.h);
      setLocalS(h2.s);
      setLocalV(h2.v);
      setLocalA(getHexAlpha01(value));
      setHexInput(value);
    }
  }, [value]);

  /* emit change */
  const emit = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const [r, g, b] = hsvToRgb(h, s, v);
      let hex = rgbToHex(r, g, b);
      hex = setHexAlpha01(hex, a);
      setHexInput(hex);
      onChange(hex);
    },
    [onChange],
  );

  /* redraw saturation / value canvas whenever hue changes */
  useEffect(() => {
    const cv = svCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;
    const w = cv.width, h = cv.height;

    /* base hue fill */
    const [hr, hg, hb] = hsvToRgb(localH, 1, 1);
    ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
    ctx.fillRect(0, 0, w, h);

    /* white → transparent horizontal gradient (saturation) */
    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, w, h);

    /* transparent → black vertical gradient (value) */
    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, h);
  }, [localH, open]);

  /* pointer helpers for SV canvas */
  const applySV = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const cv = svCanvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      setLocalS(s);
      setLocalV(v);
      emit(localH, s, v, localA);
    },
    [localH, localA, emit],
  );

  /* pointer helpers for hue bar */
  const applyHue = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const bar = (e.currentTarget ?? e.target) as HTMLElement;
      const rect = bar.getBoundingClientRect();
      const h = Math.max(0, Math.min(359.99, ((e.clientX - rect.left) / rect.width) * 360));
      setLocalH(h);
      emit(h, localS, localV, localA);
    },
    [localS, localV, localA, emit],
  );

  /* pointer helpers for alpha bar */
  const applyAlpha = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const bar = (e.currentTarget ?? e.target) as HTMLElement;
      const rect = bar.getBoundingClientRect();
      const a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setLocalA(a);
      emit(localH, localS, localV, a);
    },
    [localH, localS, localV, emit],
  );

  /* global pointer events for drag */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingSV.current) {
        const cv = svCanvasRef.current;
        if (!cv) return;
        const rect = cv.getBoundingClientRect();
        const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        setLocalS(s);
        setLocalV(v);
        emit(localH, s, v, localA);
      }
      if (draggingHue.current) {
        const bar = document.getElementById('cpwa-hue-bar');
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        const h = Math.max(0, Math.min(359.99, ((e.clientX - rect.left) / rect.width) * 360));
        setLocalH(h);
        emit(h, localS, localV, localA);
      }
      if (draggingAlpha.current) {
        const bar = document.getElementById('cpwa-alpha-bar');
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        const a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setLocalA(a);
        emit(localH, localS, localV, a);
      }
    };
    const onUp = () => {
      draggingSV.current = false;
      draggingHue.current = false;
      draggingAlpha.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [localH, localS, localV, localA, emit]);

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* panel position — re-anchor on scroll / resize so the panel sticks to the swatch */
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const panelW = 272;
      const panelH = panelRef.current?.offsetHeight ?? 275;
      const gap = 4;
      let top = r.bottom + gap;
      let left = r.left;
      if (top + panelH > window.innerHeight) top = r.top - panelH - gap;
      if (left + panelW > window.innerWidth) left = window.innerWidth - panelW - 8;
      if (left < 4) left = 4;
      setPos({ top, left });
    };
    reposition();
    /* re-run after panel paints so we use its real measured height */
    const raf = requestAnimationFrame(reposition);
    /* capture: true so we catch scrolls inside any ancestor container */
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  /* preview color string */
  const previewRgb = hsvToRgb(localH, localS, localV);
  const previewHex = rgbToHex(...previewRgb);

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
          className="w-[272px] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        >
          {/* Saturation / Value area */}
          <div className="relative mb-3 h-[160px] w-full overflow-hidden rounded-lg" style={{ cursor: 'crosshair' }}>
            <canvas
              ref={svCanvasRef}
              width={256}
              height={160}
              className="h-full w-full rounded-lg"
              onPointerDown={(e) => {
                draggingSV.current = true;
                applySV(e as unknown as PointerEvent);
              }}
            />
            {/* thumb */}
            <div
              className="pointer-events-none absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${localS * 100}%`,
                top: `${(1 - localV) * 100}%`,
                background: previewHex,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          {/* Hue slider */}
          <div
            id="cpwa-hue-bar"
            className="relative mb-2 h-3 w-full cursor-pointer rounded-full"
            style={{
              background:
                'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
            onPointerDown={(e) => {
              draggingHue.current = true;
              applyHue(e);
            }}
          >
            <div
              className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${(localH / 360) * 100}%`,
                background: `hsl(${localH}, 100%, 50%)`,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          {/* Alpha slider */}
          <div className="relative mb-3 h-3 w-full cursor-pointer overflow-hidden rounded-full"
            id="cpwa-alpha-bar"
            style={{
              backgroundImage:
                `linear-gradient(to right, rgba(${previewRgb[0]},${previewRgb[1]},${previewRgb[2]},0), rgba(${previewRgb[0]},${previewRgb[1]},${previewRgb[2]},1)), ` +
                'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)',
              backgroundSize: '100% 100%, 8px 8px',
            }}
            onPointerDown={(e) => {
              draggingAlpha.current = true;
              applyAlpha(e);
            }}
          >
            <div
              className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${localA * 100}%`,
                background: `rgba(${previewRgb[0]},${previewRgb[1]},${previewRgb[2]},${localA})`,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          {/* Hex input + alpha % */}
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 shrink-0 rounded-md border border-gray-300 dark:border-gray-600"
              style={{
                backgroundImage:
                  `linear-gradient(${previewHex}${Math.round(localA * 255)
                    .toString(16)
                    .padStart(2, '0')}, ${previewHex}${Math.round(localA * 255)
                    .toString(16)
                    .padStart(2, '0')}), ` +
                  'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)',
                backgroundSize: '100% 100%, 8px 8px',
              }}
            />
            <input
              type="text"
              className="h-8 flex-1 rounded-md border border-gray-300 bg-transparent px-2 font-mono text-xs dark:border-gray-600"
              value={hexInput}
              onChange={(e) => {
                const v = e.target.value;
                setHexInput(v);
                if (THEME_HEX_6_OR_8_RE.test(v)) {
                  const r2 = hexToRgb(v);
                  const h2 = rgbToHsv(...r2);
                  setLocalH(h2.h);
                  setLocalS(h2.s);
                  setLocalV(h2.v);
                  setLocalA(getHexAlpha01(v));
                  onChange(v);
                }
              }}
              spellCheck={false}
            />
            <span className="shrink-0 text-xs text-gray-500">{Math.round(localA * 100)}%</span>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="flex items-center gap-2">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="group relative h-8 w-8 shrink-0 rounded-md border border-gray-300 transition-shadow hover:ring-2 hover:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
        style={{
          backgroundImage:
            `linear-gradient(${value}, ${value}), ` +
            'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)',
          backgroundSize: '100% 100%, 8px 8px',
        }}
        title={label ?? 'Pick color'}
      />
      {label && (
        <span className="truncate text-xs text-gray-600 dark:text-gray-400">{label}</span>
      )}
      {panel}
    </div>
  );
}

export function ThemeSettingsTabs({
  initialHeaderLinks,
  initialFooterLinks,
  initialFooterText,
  initialCustomCss,
  initialCustomHead,
  initialCustomBody,
  initialPricingSettings,
  initialHeaderLayoutSettings,
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('navigation');

  const parseHexColor = useCallback((hex: string): { rgb: string; a: number } => {
    const clean = (hex || '').trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(clean)) return { rgb: '0 0 0', a: 1 };
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
    return { rgb: `${r} ${g} ${b}`, a: Math.max(0, Math.min(1, a)) };
  }, []);

  const fmtAlpha = useCallback((a: number): string => {
    const fixed = Math.max(0, Math.min(1, a)).toFixed(4);
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }, []);

  const applyPaletteToDocument = useCallback((palette: ThemeColorPalette) => {
    if (typeof document === 'undefined') return;

    const buildBlock = (t: ColorTokens, _mode: 'light' | 'dark') => {
      const headerBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(t.headerBlur) ? t.headerBlur : 12)));
      const headerBorderWidthPx = Math.max(0, Math.min(4, Math.round(Number.isFinite(t.headerBorderWidth) ? t.headerBorderWidth : 1)));

      const stickyHeaderBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(t.stickyHeaderBlur) ? t.stickyHeaderBlur : 14)));
      const stickyHeaderBorderWidthPx = Math.max(0, Math.min(4, Math.round(Number.isFinite(t.stickyHeaderBorderWidth) ? t.stickyHeaderBorderWidth : 1)));

      const cssToken = (name: string, hex: string) => {
        const p = parseHexColor(hex);
        const a = fmtAlpha(p.a);
        return [`  --${name}: ${p.rgb} / ${a};`, `  --${name}-rgb: ${p.rgb};`, `  --${name}-a: ${a};`];
      };

      const headerBg = parseHexColor(t.headerBg);
      const headerText = parseHexColor(t.headerText ?? t.textPrimary);
      const headerBorder = parseHexColor(t.headerBorder ?? t.borderPrimary);
      const stickyHeaderBg = parseHexColor(t.stickyHeaderBg ?? t.headerBg);
      const stickyHeaderText = parseHexColor(t.stickyHeaderText ?? t.textPrimary);
      const stickyHeaderBorder = parseHexColor(t.stickyHeaderBorder ?? t.headerBorder ?? t.borderPrimary);
      const sidebarBg = parseHexColor(t.sidebarBg);
      const pageGlow = parseHexColor(t.pageGlow);

      const pageFrom = parseHexColor(t.pageGradientFrom);
      const pageVia = parseHexColor(t.pageGradientVia);
      const pageTo = parseHexColor(t.pageGradientTo);
      const heroFrom = parseHexColor(t.heroGradientFrom ?? t.pageGradientFrom);
      const heroVia = parseHexColor(t.heroGradientVia ?? t.pageGradientVia);
      const heroTo = parseHexColor(t.heroGradientTo ?? t.pageGradientTo);
      const cardFrom = parseHexColor(t.cardGradientFrom ?? t.pageGradientFrom);
      const cardVia = parseHexColor(t.cardGradientVia ?? t.pageGradientVia);
      const cardTo = parseHexColor(t.cardGradientTo ?? t.pageGradientTo);
      const tabsFrom = parseHexColor(t.tabsGradientFrom ?? t.pageGradientFrom);
      const tabsVia = parseHexColor(t.tabsGradientVia ?? t.pageGradientVia);
      const tabsTo = parseHexColor(t.tabsGradientTo ?? t.pageGradientTo);

      return [
        ...cssToken('bg-primary', t.bgPrimary),
        ...cssToken('bg-secondary', t.panelBg ?? t.bgSecondary),
        ...cssToken('surface-panel', t.panelBg ?? t.bgSecondary),
        ...cssToken('surface-card', t.bgSecondary),
        ...cssToken('surface-hero', t.heroBg ?? t.bgSecondary),
        ...cssToken('bg-tertiary', t.bgTertiary),
        ...cssToken('bg-quaternary', t.bgQuaternary),
        ...cssToken('text-primary', t.textPrimary),
        ...cssToken('text-secondary', t.textSecondary),
        ...cssToken('text-tertiary', t.textTertiary),
        ...cssToken('border-primary', t.borderPrimary),
        ...cssToken('border-secondary', t.borderSecondary),
        ...cssToken('accent-primary', t.accentPrimary),
        ...cssToken('accent-hover', t.accentHover),
        `  --theme-header-bg: rgb(${headerBg.rgb} / ${fmtAlpha(headerBg.a)});`,
        `  --theme-header-text: rgb(${headerText.rgb} / ${fmtAlpha(headerText.a)});`,
        `  --theme-header-blur: ${headerBlurPx}px;`,
        `  --theme-header-border: rgb(${headerBorder.rgb} / ${fmtAlpha(headerBorder.a)});`,
        `  --theme-header-border-width: ${headerBorderWidthPx}px;`,
        `  --theme-sticky-header-bg: rgb(${stickyHeaderBg.rgb} / ${fmtAlpha(stickyHeaderBg.a)});`,
        `  --theme-sticky-header-text: rgb(${stickyHeaderText.rgb} / ${fmtAlpha(stickyHeaderText.a)});`,
        `  --theme-sticky-header-blur: ${stickyHeaderBlurPx}px;`,
        `  --theme-sticky-header-border: rgb(${stickyHeaderBorder.rgb} / ${fmtAlpha(stickyHeaderBorder.a)});`,
        `  --theme-sticky-header-border-width: ${stickyHeaderBorderWidthPx}px;`,
        `  --theme-sidebar-bg: rgb(${sidebarBg.rgb} / ${fmtAlpha(sidebarBg.a)});`,
        `  --theme-page-gradient-from: rgb(${pageFrom.rgb} / ${fmtAlpha(pageFrom.a)});`,
        `  --theme-page-gradient-via: rgb(${pageVia.rgb} / ${fmtAlpha(pageVia.a)});`,
        `  --theme-page-gradient-to: rgb(${pageTo.rgb} / ${fmtAlpha(pageTo.a)});`,
        `  --theme-hero-gradient-from: rgb(${heroFrom.rgb} / ${fmtAlpha(heroFrom.a)});`,
        `  --theme-hero-gradient-via: rgb(${heroVia.rgb} / ${fmtAlpha(heroVia.a)});`,
        `  --theme-hero-gradient-to: rgb(${heroTo.rgb} / ${fmtAlpha(heroTo.a)});`,
        `  --theme-card-gradient-from: rgb(${cardFrom.rgb} / ${fmtAlpha(cardFrom.a)});`,
        `  --theme-card-gradient-via: rgb(${cardVia.rgb} / ${fmtAlpha(cardVia.a)});`,
        `  --theme-card-gradient-to: rgb(${cardTo.rgb} / ${fmtAlpha(cardTo.a)});`,
        `  --theme-tabs-gradient-from: rgb(${tabsFrom.rgb} / ${fmtAlpha(tabsFrom.a)});`,
        `  --theme-tabs-gradient-via: rgb(${tabsVia.rgb} / ${fmtAlpha(tabsVia.a)});`,
        `  --theme-tabs-gradient-to: rgb(${tabsTo.rgb} / ${fmtAlpha(tabsTo.a)});`,
        `  --theme-page-glow: rgb(${pageGlow.rgb} / ${fmtAlpha(pageGlow.a)});`,
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
  }, [fmtAlpha, parseHexColor]);
  
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

  const [headerStyle, setHeaderStyle] = useState<HeaderLayoutSettings['style']>(initialHeaderLayoutSettings.style);
  const [headerHeight, setHeaderHeight] = useState<number>(initialHeaderLayoutSettings.height);
  const [headerStickyEnabled, setHeaderStickyEnabled] = useState<boolean>(initialHeaderLayoutSettings.stickyEnabled);
  const [headerStickyScrollY, setHeaderStickyScrollY] = useState<number>(initialHeaderLayoutSettings.stickyScrollY);
  const [headerStickyHeight, setHeaderStickyHeight] = useState<number>(initialHeaderLayoutSettings.stickyHeight);
  
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

  const handleSaveColorPreset = useCallback(async (name: string, mode: 'light' | 'dark'): Promise<boolean> => {
    const trimmed = (name || '').trim().slice(0, 48);
    if (!trimmed) return false;

    const prev = colorPresets;
    const key = trimmed.toLowerCase();
    const existing = prev.find((preset) => preset.name.toLowerCase() === key);

    const nextPreset: ThemeColorPreset = existing
      ? {
          name: trimmed,
          light: mode === 'light' ? lightColors : existing.light,
          dark: mode === 'dark' ? darkColors : existing.dark,
        }
      : {
          name: trimmed,
          light: mode === 'light' ? lightColors : DEFAULT_LIGHT_COLORS,
          dark: mode === 'dark' ? darkColors : DEFAULT_DARK_COLORS,
        };

    const next: ThemeColorPreset[] = [
      ...prev.filter((preset) => preset.name.toLowerCase() !== key),
      nextPreset,
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
        return false;
      }

      showToast('Preset saved', 'success');
      try {
        router.refresh();
      } catch {
        // ignore
      }
      return true;
    } catch (error) {
      console.error('Failed to save color preset', error);
      setColorPresets(prev);
      showToast('Failed to save preset', 'error');
      return false;
    }
  }, [colorPresets, darkColors, lightColors, router]);

  const handleDeleteColorPreset = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = (name || '').trim();
    if (!trimmed) return false;

    const prev = colorPresets;
    const next = prev.filter((preset) => preset.name.toLowerCase() !== trimmed.toLowerCase());
    if (next.length === prev.length) return false;

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
        return false;
      }

      showToast('Preset deleted', 'success');
      try {
        router.refresh();
      } catch {
        // ignore
      }
      return true;
    } catch (error) {
      console.error('Failed to delete color preset', error);
      setColorPresets(prev);
      showToast('Failed to delete preset', 'error');
      return false;
    }
  }, [colorPresets, router]);
  
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

      const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
      const safeHeaderHeight = clampInt(Number.isFinite(headerHeight) ? headerHeight : 80, 48, 160);
      const safeStickyScrollY = clampInt(Number.isFinite(headerStickyScrollY) ? headerStickyScrollY : 120, 0, 2000);
      const safeStickyHeight = clampInt(Number.isFinite(headerStickyHeight) ? headerStickyHeight : 64, 40, 160);

      const bulkSettingsResponse = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [
            // pricing + listing settings
            { key: 'PRICING_MAX_COLUMNS', value: pricingMaxColumns.toString() },
            { key: 'PRICING_CENTER_UNEVEN', value: pricingCenterUneven.toString() },
            // header layout settings
            { key: 'HEADER_STYLE', value: headerStyle },
            { key: 'HEADER_HEIGHT', value: safeHeaderHeight.toString() },
            { key: 'HEADER_STICKY_ENABLED', value: headerStickyEnabled.toString() },
            { key: 'HEADER_STICKY_SCROLL_Y', value: safeStickyScrollY.toString() },
            { key: 'HEADER_STICKY_HEIGHT', value: safeStickyHeight.toString() },
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

      // The actual site header reads layout settings server-side.
      // Refresh the route so the updated header height/style apply immediately.
      router.refresh();
    } catch (error) {
      console.error('Failed to save settings', error);
      showToast('Unexpected error saving settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    saving, headerLinks, footerLinks, footerText, customCss, customHead, customBody,
    normalizeLinks, pricingMaxColumns, pricingCenterUneven,
    headerStyle, headerHeight, headerStickyEnabled, headerStickyScrollY, headerStickyHeight,
    blogListingStyle,
    blogListingPageSize, blogSidebarEnabledIndex, blogSidebarEnabledSingle,
    blogSidebarEnabledArchive, blogSidebarEnabledPages, sidebarWidgets,
    blogRelatedPostsEnabled, blogHtmlBeforeFirst, blogHtmlMiddle, blogHtmlAfterLast,
    lightColors, darkColors,
    applyPaletteToDocument,
    router,
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
            <p className="text-sm text-slate-600 dark:text-neutral-300 mb-6">Configure background, transparency, blur, and text color while the header is sticky.</p>

            <div className={cx('space-y-4', !headerStickyEnabled && 'opacity-60')}>
              <div className="grid gap-4 lg:grid-cols-2">
                {([
                  { title: 'Light mode', mode: 'light' as const, value: lightColors, setValue: setLightColors },
                  { title: 'Dark mode', mode: 'dark' as const, value: darkColors, setValue: setDarkColors },
                ]).map(({ title, mode, value, setValue }) => {
                  const updateHex = (key: 'stickyHeaderBg' | 'stickyHeaderText', hex: string) => {
                    setValue({ ...value, [key]: hex });
                  };

                  const updateBlur = (px: number) => {
                    const clamped = Math.max(0, Math.min(40, Math.round(px)));
                    setValue({ ...value, stickyHeaderBlur: clamped });
                  };

                  return (
                    <div
                      key={`sticky-colors-${mode}`}
                      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{title}</div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                          <span className="text-sm text-slate-700 dark:text-neutral-300">Background</span>
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
                    : `Cards will be arranged in up to ${pricingMaxColumns} column${pricingMaxColumns === 1 ? '' : 's'} maximum.`
                  }
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
                    : 'Cards will always be left-aligned regardless of count.'
                  }
                </p>
              </div>
            </div>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">
            Header, sidebar, page background gradient, and glow colors live under the <span className="font-semibold text-slate-900 dark:text-neutral-100">Colors</span> tab. Sticky header colors are configured above.
          </div>
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
    headerStyle, headerHeight, headerStickyEnabled, headerStickyScrollY, headerStickyHeight,
    setHeaderStyle, setHeaderHeight, setHeaderStickyEnabled, setHeaderStickyScrollY, setHeaderStickyHeight,
    customCss, customHead, customBody, setCustomCss, setCustomHead, setCustomBody,
    blogHtmlBeforeFirst, blogHtmlMiddle, blogHtmlAfterLast,
    lightColors, darkColors, colorMode, setColorMode,
  ]);

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div
        className="relative flex overflow-hidden rounded-2xl border border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.25))] bg-[linear-gradient(135deg,var(--theme-tabs-gradient-from),var(--theme-tabs-gradient-via),var(--theme-tabs-gradient-to))] shadow-[0_12px_45px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12))] transition-shadow dark:border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] dark:shadow-[0_0_40px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))]"
        role="tablist"
        aria-label="Theme settings sections"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18)),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.28)),_transparent_60%)]" />
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