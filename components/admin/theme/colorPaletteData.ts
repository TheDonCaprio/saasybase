// Client-side theme palette types/defaults used by the admin theme editor.

export type ColorHexKey =
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
  | 'sidebarBorder'
  | 'headerShadow'
  // Sticky header shadow is configured in Layout tab (not in the Colors tab).
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

export type OpacityKey =
  | 'headerOpacity'
  | 'sidebarOpacity'
  | 'glowOpacity'
  | 'headerBorderOpacity'
  | 'stickyHeaderBorderOpacity';

export type ColorTokens = {
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
  headerMenuFontSize: number;
  headerMenuFontWeight: number;
  stickyHeaderBg: string;
  stickyHeaderOpacity: number;
  stickyHeaderBlur: number;
  stickyHeaderText: string;
  stickyHeaderBorder: string;
  stickyHeaderBorderOpacity: number;
  stickyHeaderBorderWidth: number;
  sidebarBg: string;
  sidebarBorder: string;
  sidebarOpacity: number;
  headerShadow: string;
  headerShadowBlur: number;
  headerShadowSpread: number;
  stickyHeaderShadow: string;
  stickyHeaderShadowBlur: number;
  stickyHeaderShadowSpread: number;
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

// Optional across presets so existing built-ins don't need updates.
type OptionalEffectKeys =
  | 'sidebarBorder'
  | 'headerShadow'
  | 'headerShadowBlur'
  | 'headerShadowSpread'
  | 'stickyHeaderShadow'
  | 'stickyHeaderShadowBlur'
  | 'stickyHeaderShadowSpread'
  | 'headerMenuFontSize'
  | 'headerMenuFontWeight';

export type PartialColorTokens = Omit<ColorTokens, OptionalPresetKeys | OptionalEffectKeys> &
  Partial<Pick<ColorTokens, OptionalPresetKeys | OptionalEffectKeys>>;

export const fillElementGradients = (t: PartialColorTokens): ColorTokens => {
  const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
    const num = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  };

  return {
    ...(t as Omit<ColorTokens, ElementGradientKeys>),
    headerText: t.headerText ?? t.textPrimary,
    headerBlur: typeof t.headerBlur === 'number' ? t.headerBlur : 12,
    headerBorder: t.headerBorder ?? t.borderPrimary,
    headerBorderOpacity: typeof t.headerBorderOpacity === 'number' ? t.headerBorderOpacity : 1,
    headerBorderWidth: typeof t.headerBorderWidth === 'number' ? t.headerBorderWidth : 1,
    headerMenuFontSize: clampInt((t as any).headerMenuFontSize, 10, 20, 14),
    headerMenuFontWeight: clampInt((t as any).headerMenuFontWeight, 300, 800, 400),
    stickyHeaderBg: t.stickyHeaderBg ?? t.headerBg,
    stickyHeaderOpacity: typeof t.stickyHeaderOpacity === 'number' ? t.stickyHeaderOpacity : 1,
    stickyHeaderBlur: typeof t.stickyHeaderBlur === 'number' ? t.stickyHeaderBlur : 14,
    stickyHeaderText: t.stickyHeaderText ?? t.headerText ?? t.textPrimary,
    stickyHeaderBorder: t.stickyHeaderBorder ?? t.headerBorder ?? t.borderPrimary,
    stickyHeaderBorderOpacity: typeof t.stickyHeaderBorderOpacity === 'number' ? t.stickyHeaderBorderOpacity : 1,
    stickyHeaderBorderWidth:
      typeof t.stickyHeaderBorderWidth === 'number'
        ? t.stickyHeaderBorderWidth
        : typeof t.headerBorderWidth === 'number'
          ? t.headerBorderWidth
          : 1,
    sidebarBorder: t.sidebarBorder ?? t.borderPrimary,
    headerShadow: t.headerShadow ?? '#00000014',
    headerShadowBlur: clampInt((t as any).headerShadowBlur, 0, 80, 30),
    headerShadowSpread: clampInt((t as any).headerShadowSpread, -80, 80, -22),
    stickyHeaderShadow: (t as any).stickyHeaderShadow ?? t.headerShadow ?? '#00000014',
    stickyHeaderShadowBlur: clampInt((t as any).stickyHeaderShadowBlur, 0, 80, clampInt((t as any).headerShadowBlur, 0, 80, 30)),
    stickyHeaderShadowSpread: clampInt(
      (t as any).stickyHeaderShadowSpread,
      -80,
      80,
      clampInt((t as any).headerShadowSpread, -80, 80, -22),
    ),
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

export type ThemeColorPalette = { light: ColorTokens; dark: ColorTokens };

export type ThemeColorPreset = { name: string; light: ColorTokens; dark: ColorTokens };

export const DEFAULT_LIGHT_COLORS: ColorTokens = {
  bgPrimary: '#ffffff',
  bgSecondary: '#f9fafb',
  panelBg: '#f9fafb',
  heroBg: '#f9fafb',
  bgTertiary: '#f3f4f6',
  bgQuaternary: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  textTertiary: '#6b7280',
  borderPrimary: '#d1d5db',
  borderSecondary: '#9ca3af',
  accentPrimary: '#3b82f6',
  accentHover: '#2563eb',
  headerBg: '#ffffff37',
  headerOpacity: 1,
  headerText: '#111827',
  headerBlur: 20,
  headerBorder: '#d1d5db4c',
  headerBorderOpacity: 1,
  headerBorderWidth: 1,
  headerMenuFontSize: 14,
  headerMenuFontWeight: 600,
  stickyHeaderBg: '#ffffff3e',
  stickyHeaderOpacity: 1,
  stickyHeaderBlur: 15,
  stickyHeaderText: '#111827',
  stickyHeaderBorder: '#cccfd420',
  stickyHeaderBorderOpacity: 1,
  stickyHeaderBorderWidth: 1,
  sidebarBg: '#ffffff80',
  sidebarBorder: '#ececec6c',
  sidebarOpacity: 1,
  headerShadow: '#00000062',
  headerShadowBlur: 30,
  headerShadowSpread: -27,
  stickyHeaderShadow: '#9e9c9cef',
  stickyHeaderShadowBlur: 30,
  stickyHeaderShadowSpread: -23,
  pageGradientFrom: '#ffffff',
  pageGradientVia: '#d8ecfa',
  pageGradientTo: '#ffffff',
  heroGradientFrom: '#f0f9ff00',
  heroGradientVia: '#eef2ff',
  heroGradientTo: '#ffffff',
  cardGradientFrom: '#f0f9ff',
  cardGradientVia: '#eef2ff',
  cardGradientTo: '#ffffff',
  tabsGradientFrom: '#ffffff',
  tabsGradientVia: '#eef2ff',
  tabsGradientTo: '#ffffff',
  pageGlow: '#3b82f673',
  glowOpacity: 1,
};

export const DEFAULT_DARK_COLORS: ColorTokens = {
  bgPrimary: '#0a0a0a',
  bgSecondary: '#171717',
  panelBg: '#171717',
  heroBg: '#171717',
  bgTertiary: '#262626',
  bgQuaternary: '#404040',
  textPrimary: '#f5f5f5',
  textSecondary: '#a3a3a3',
  textTertiary: '#737373',
  borderPrimary: '#4040407f',
  borderSecondary: '#4d4d4dc3',
  accentPrimary: '#3b82f6',
  accentHover: '#2563eb',
  headerBg: '#0a0a0a3e',
  headerOpacity: 1,
  headerText: '#f5f5f5',
  headerBlur: 12,
  headerBorder: '#31313179',
  headerBorderOpacity: 1,
  headerBorderWidth: 1,
  headerMenuFontSize: 14,
  headerMenuFontWeight: 600,
  stickyHeaderBg: '#0a0a0a35',
  stickyHeaderOpacity: 1,
  stickyHeaderBlur: 15,
  stickyHeaderText: '#f5f5f5',
  stickyHeaderBorder: '#40404000',
  stickyHeaderBorderOpacity: 1,
  stickyHeaderBorderWidth: 1,
  sidebarBg: '#1717175d',
  sidebarBorder: '#40404000',
  sidebarOpacity: 1,
  headerShadow: '#8e8e8e61',
  headerShadowBlur: 30,
  headerShadowSpread: -23,
  stickyHeaderShadow: '#6f6f6f7d',
  stickyHeaderShadowBlur: 30,
  stickyHeaderShadowSpread: -19,
  pageGradientFrom: '#171717',
  pageGradientVia: '#312e81',
  pageGradientTo: '#0a0a0a',
  heroGradientFrom: '#171717',
  heroGradientVia: '#312e81',
  heroGradientTo: '#0a0a0a',
  cardGradientFrom: '#171717',
  cardGradientVia: '#312e81',
  cardGradientTo: '#0a0a0a',
  tabsGradientFrom: '#171717',
  tabsGradientVia: '#312e81',
  tabsGradientTo: '#0a0a0a',
  pageGlow: '#6366f1c7',
  glowOpacity: 1,
};

export const COLOR_LABELS: Record<ColorHexKey, string> = {
  bgPrimary: 'Base background',
  bgSecondary: 'Stat / info cards',
  heroBg: 'Top hero',
  panelBg: 'Panels',
  bgTertiary: 'Input fields',
  bgQuaternary: 'Hover fills',
  textPrimary: 'Primary text',
  textSecondary: 'Secondary text',
  textTertiary: 'Placeholder text',
  borderPrimary: 'Primary border',
  borderSecondary: 'Secondary border',
  accentPrimary: 'Primary accent',
  accentHover: 'Accent hover',
  headerBg: 'Header background',
  headerText: 'Header text',
  headerBorder: 'Header border (bottom)',
  stickyHeaderBg: 'Sticky header background',
  stickyHeaderText: 'Sticky header text',
  stickyHeaderBorder: 'Sticky header border (bottom)',
  sidebarBg: 'Sidebar background',
  sidebarBorder: 'Sidebar border',
  headerShadow: 'Header drop shadow',
  pageGradientFrom: 'Page background (from)',
  pageGradientVia: 'Page background (via)',
  pageGradientTo: 'Page background (to)',
  heroGradientFrom: 'Top hero gradient (from)',
  heroGradientVia: 'Top hero gradient (via)',
  heroGradientTo: 'Top hero gradient (to)',
  cardGradientFrom: 'Stat / info gradient (from)',
  cardGradientVia: 'Stat / info gradient (via)',
  cardGradientTo: 'Stat / info gradient (to)',
  tabsGradientFrom: 'Tab strip gradient (from)',
  tabsGradientVia: 'Tab strip gradient (via)',
  tabsGradientTo: 'Tab strip gradient (to)',
  pageGlow: 'Backdrop glow accent',
};

export const COLOR_GROUPS: Array<{ title: string; keys: ColorHexKey[] }> = [
  {
    title: 'Backgrounds',
    keys: ['bgPrimary', 'bgTertiary', 'bgQuaternary', 'pageGradientFrom', 'pageGradientVia', 'pageGradientTo', 'pageGlow'],
  },
  {
    title: 'Surfaces',
    keys: [
      'bgSecondary',
      'heroBg',
      'panelBg',
      'heroGradientFrom',
      'heroGradientVia',
      'heroGradientTo',
      'cardGradientFrom',
      'cardGradientVia',
      'cardGradientTo',
    ],
  },
  { title: 'Text', keys: ['textPrimary', 'textSecondary', 'textTertiary'] },
  { title: 'Borders', keys: ['borderPrimary', 'borderSecondary'] },
  { title: 'Accents', keys: ['accentPrimary', 'accentHover'] },
  { title: 'Header', keys: ['headerBg', 'headerText', 'headerBorder', 'headerShadow'] },
  { title: 'Layout', keys: ['sidebarBg', 'sidebarBorder'] },
  { title: 'Tab Strip Gradient', keys: ['tabsGradientFrom', 'tabsGradientVia', 'tabsGradientTo'] },
];

export const LIGHT_PRESETS: Array<{ name: string; accent: string; colors: PartialColorTokens }> = [
  {
    name: 'Default',
    accent: DEFAULT_LIGHT_COLORS.accentPrimary,
    colors: DEFAULT_LIGHT_COLORS,
  },
  {
    name: 'Warm',
    accent: '#fef3dc',
    colors: {
      bgPrimary: '#fffbf5',
      bgSecondary: '#fef8ee',
      panelBg: DEFAULT_LIGHT_COLORS.panelBg,
      heroBg: DEFAULT_LIGHT_COLORS.heroBg,
      bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary,
      bgQuaternary: '#fde9be',
      textPrimary: '#1c1009',
      textSecondary: '#78461d',
      textTertiary: '#9a6b3c',
      borderPrimary: '#f5d9a0',
      borderSecondary: '#e8bc6a',
      accentPrimary: '#f59e0b',
      accentHover: '#d97706',
      headerBg: '#fffbf537',
      headerOpacity: 1,
      headerBlur: 20,
      headerBorder: '#f5d9a04c',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#fffbf53e',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#f5d9a020',
      sidebarBg: '#fffbf580',
      sidebarBorder: '#ececec6c',
      sidebarOpacity: 1,
      headerShadow: '#00000062',
      headerShadowBlur: 30,
      headerShadowSpread: -27,
      stickyHeaderShadow: '#9e9c9cef',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -23,
      pageGradientFrom: '#fffbf5',
      pageGradientVia: '#fef3dc',
      pageGradientTo: '#ffffff',
      pageGlow: '#f59e0b73',
      glowOpacity: 1,
    },
  },
  {
    name: 'Ocean',
    accent: '#e0f2fe',
    colors: {
      bgPrimary: '#f0f9ff',
      bgSecondary: '#e0f2fe',
      panelBg: DEFAULT_LIGHT_COLORS.panelBg,
      heroBg: DEFAULT_LIGHT_COLORS.heroBg,
      bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary,
      bgQuaternary: '#7dd3fc',
      textPrimary: '#0c2d48',
      textSecondary: '#0369a1',
      textTertiary: '#0284c7',
      borderPrimary: '#bae6fd',
      borderSecondary: '#7dd3fc',
      accentPrimary: '#0ea5e9',
      accentHover: '#0284c7',
      headerBg: '#f0f9ff37',
      headerOpacity: 1,
      headerBlur: 20,
      headerBorder: '#bae6fd4c',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#f0f9ff3e',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#bae6fd20',
      sidebarBg: '#f0f9ff80',
      sidebarBorder: '#ececec6c',
      sidebarOpacity: 1,
      headerShadow: '#00000062',
      headerShadowBlur: 30,
      headerShadowSpread: -27,
      stickyHeaderShadow: '#9e9c9cef',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -23,
      pageGradientFrom: '#f0f9ff',
      pageGradientVia: '#e0f2fe',
      pageGradientTo: '#ffffff',
      pageGlow: '#0ea5e973',
      glowOpacity: 1,
    },
  },
  {
    name: 'Lavender',
    accent: '#f3e8ff',
    colors: {
      bgPrimary: '#faf5ff',
      bgSecondary: '#f3e8ff',
      panelBg: DEFAULT_LIGHT_COLORS.panelBg,
      heroBg: DEFAULT_LIGHT_COLORS.heroBg,
      bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary,
      bgQuaternary: '#d8b4fe',
      textPrimary: '#2e1065',
      textSecondary: '#7e22ce',
      textTertiary: '#9333ea',
      borderPrimary: '#e9d5ff',
      borderSecondary: '#d8b4fe',
      accentPrimary: '#a855f7',
      accentHover: '#9333ea',
      headerBg: '#faf5ff37',
      headerOpacity: 1,
      headerBlur: 20,
      headerBorder: '#e9d5ff4c',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#faf5ff3e',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#e9d5ff20',
      sidebarBg: '#faf5ff80',
      sidebarBorder: '#ececec6c',
      sidebarOpacity: 1,
      headerShadow: '#00000062',
      headerShadowBlur: 30,
      headerShadowSpread: -27,
      stickyHeaderShadow: '#9e9c9cef',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -23,
      pageGradientFrom: '#faf5ff',
      pageGradientVia: '#f3e8ff',
      pageGradientTo: '#ffffff',
      pageGlow: '#a855f773',
      glowOpacity: 1,
    },
  },
  {
    name: 'Sage',
    accent: '#dcfce7',
    colors: {
      bgPrimary: '#f0fdf4',
      bgSecondary: '#dcfce7',
      panelBg: DEFAULT_LIGHT_COLORS.panelBg,
      heroBg: DEFAULT_LIGHT_COLORS.heroBg,
      bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary,
      bgQuaternary: '#86efac',
      textPrimary: '#052e16',
      textSecondary: '#15803d',
      textTertiary: '#16a34a',
      borderPrimary: '#bbf7d0',
      borderSecondary: '#86efac',
      accentPrimary: '#22c55e',
      accentHover: '#16a34a',
      headerBg: '#f0fdf437',
      headerOpacity: 1,
      headerBlur: 20,
      headerBorder: '#bbf7d04c',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#f0fdf43e',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#bbf7d020',
      sidebarBg: '#f0fdf480',
      sidebarBorder: '#ececec6c',
      sidebarOpacity: 1,
      headerShadow: '#00000062',
      headerShadowBlur: 30,
      headerShadowSpread: -27,
      stickyHeaderShadow: '#9e9c9cef',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -23,
      pageGradientFrom: '#f0fdf4',
      pageGradientVia: '#dcfce7',
      pageGradientTo: '#ffffff',
      pageGlow: '#22c55e73',
      glowOpacity: 1,
    },
  },
  {
    name: 'Sunset',
    accent: '#fff1f2',
    colors: {
      bgPrimary: '#fff7f7',
      bgSecondary: '#fff1f2',
      panelBg: DEFAULT_LIGHT_COLORS.panelBg,
      heroBg: DEFAULT_LIGHT_COLORS.heroBg,
      bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary,
      bgQuaternary: '#fecdd3',
      textPrimary: '#1f0b0f',
      textSecondary: '#7f1d1d',
      textTertiary: '#9f1239',
      borderPrimary: '#fecdd3',
      borderSecondary: '#fda4af',
      accentPrimary: '#fb7185',
      accentHover: '#e11d48',
      headerBg: '#fff7f737',
      headerOpacity: 1,
      headerBlur: 20,
      headerBorder: '#fecdd34c',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#fff7f73e',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#fecdd320',
      sidebarBg: '#fff7f780',
      sidebarBorder: '#ececec6c',
      sidebarOpacity: 1,
      headerShadow: '#00000062',
      headerShadowBlur: 30,
      headerShadowSpread: -27,
      stickyHeaderShadow: '#9e9c9cef',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -23,
      pageGradientFrom: '#fff7f7',
      pageGradientVia: '#ffe4e6',
      pageGradientTo: '#ffffff',
      pageGlow: '#fb718573',
      glowOpacity: 1,
    },
  },
  {
    name: 'Citrine',
    accent: '#fffbeb',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#fffbeb',
      panelBg: DEFAULT_LIGHT_COLORS.panelBg,
      heroBg: DEFAULT_LIGHT_COLORS.heroBg,
      bgTertiary: DEFAULT_LIGHT_COLORS.bgTertiary,
      bgQuaternary: '#fde68a',
      textPrimary: '#1f1500',
      textSecondary: '#78350f',
      textTertiary: '#92400e',
      borderPrimary: '#fde68a',
      borderSecondary: '#fbbf24',
      accentPrimary: '#f59e0b',
      accentHover: '#b45309',
      headerBg: '#ffffff37',
      headerOpacity: 1,
      headerBlur: 20,
      headerBorder: '#fde68a4c',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#ffffff3e',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#fde68a20',
      sidebarBg: '#ffffff80',
      sidebarBorder: '#ececec6c',
      sidebarOpacity: 1,
      headerShadow: '#00000062',
      headerShadowBlur: 30,
      headerShadowSpread: -27,
      stickyHeaderShadow: '#9e9c9cef',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -23,
      pageGradientFrom: '#fffbeb',
      pageGradientVia: '#fef3c7',
      pageGradientTo: '#ffffff',
      pageGlow: '#f59e0b73',
      glowOpacity: 1,
    },
  },
];

export const DARK_PRESETS: Array<{ name: string; accent: string; colors: PartialColorTokens }> = [
  {
    name: 'Default',
    accent: DEFAULT_DARK_COLORS.accentPrimary,
    colors: DEFAULT_DARK_COLORS,
  },
  {
    name: 'Midnight',
    accent: '#0a1628',
    colors: {
      bgPrimary: '#020616',
      bgSecondary: '#0a1628',
      panelBg: DEFAULT_DARK_COLORS.panelBg,
      heroBg: DEFAULT_DARK_COLORS.heroBg,
      bgTertiary: DEFAULT_DARK_COLORS.bgTertiary,
      bgQuaternary: '#1e3a5f',
      textPrimary: '#e0f2fe',
      textSecondary: '#7dd3fc',
      textTertiary: '#38bdf8',
      borderPrimary: '#1e3a5f7f',
      borderSecondary: '#2e4e7ec3',
      accentPrimary: '#38bdf8',
      accentHover: '#0ea5e9',
      headerBg: '#0206163e',
      headerOpacity: 1,
      headerBorder: '#1e3a5f79',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#02061635',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#1e3a5f00',
      sidebarBg: '#0a16285d',
      sidebarBorder: '#1e3a5f00',
      sidebarOpacity: 1,
      headerShadow: '#8e8e8e61',
      headerShadowBlur: 30,
      headerShadowSpread: -23,
      stickyHeaderShadow: '#6f6f6f7d',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -19,
      pageGradientFrom: '#020616',
      pageGradientVia: '#0a1628',
      pageGradientTo: '#020616',
      pageGlow: '#38bdf8c7',
      glowOpacity: 1,
    },
  },
  {
    name: 'Amethyst',
    accent: '#1a0f2e',
    colors: {
      bgPrimary: '#0f0a1f',
      bgSecondary: '#1a0f2e',
      panelBg: DEFAULT_DARK_COLORS.panelBg,
      heroBg: DEFAULT_DARK_COLORS.heroBg,
      bgTertiary: DEFAULT_DARK_COLORS.bgTertiary,
      bgQuaternary: '#3d2468',
      textPrimary: '#ede9fe',
      textSecondary: '#c084fc',
      textTertiary: '#a855f7',
      borderPrimary: '#3d24687f',
      borderSecondary: '#5b3a8ac3',
      accentPrimary: '#c084fc',
      accentHover: '#a855f7',
      headerBg: '#0f0a1f3e',
      headerOpacity: 1,
      headerBorder: '#3d246879',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#0f0a1f35',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#3d246800',
      sidebarBg: '#1a0f2e5d',
      sidebarBorder: '#3d246800',
      sidebarOpacity: 1,
      headerShadow: '#8e8e8e61',
      headerShadowBlur: 30,
      headerShadowSpread: -23,
      stickyHeaderShadow: '#6f6f6f7d',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -19,
      pageGradientFrom: '#0f0a1f',
      pageGradientVia: '#1a0f2e',
      pageGradientTo: '#0a0a0a',
      pageGlow: '#c084fcc7',
      glowOpacity: 1,
    },
  },
  {
    name: 'Obsidian',
    accent: '#0a0a0a',
    colors: {
      bgPrimary: '#000000',
      bgSecondary: '#0a0a0a',
      panelBg: DEFAULT_DARK_COLORS.panelBg,
      heroBg: DEFAULT_DARK_COLORS.heroBg,
      bgTertiary: DEFAULT_DARK_COLORS.bgTertiary,
      bgQuaternary: '#1f1f1f',
      textPrimary: '#ffffff',
      textSecondary: '#a0a0a0',
      textTertiary: '#6b6b6b',
      borderPrimary: '#1f1f1f7f',
      borderSecondary: '#2d2d2dc3',
      accentPrimary: '#6366f1',
      accentHover: '#4f46e5',
      headerBg: '#0000003e',
      headerOpacity: 1,
      headerBorder: '#1f1f1f79',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#00000035',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#1f1f1f00',
      sidebarBg: '#0a0a0a5d',
      sidebarBorder: '#1f1f1f00',
      sidebarOpacity: 1,
      headerShadow: '#8e8e8e61',
      headerShadowBlur: 30,
      headerShadowSpread: -23,
      stickyHeaderShadow: '#6f6f6f7d',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -19,
      pageGradientFrom: '#000000',
      pageGradientVia: '#0a0a0a',
      pageGradientTo: '#000000',
      pageGlow: '#6366f1c7',
      glowOpacity: 1,
    },
  },
  {
    name: 'Forest',
    accent: '#0d261e',
    colors: {
      bgPrimary: '#071612',
      bgSecondary: '#0d261e',
      panelBg: DEFAULT_DARK_COLORS.panelBg,
      heroBg: DEFAULT_DARK_COLORS.heroBg,
      bgTertiary: DEFAULT_DARK_COLORS.bgTertiary,
      bgQuaternary: '#1c4d3a',
      textPrimary: '#d1fae5',
      textSecondary: '#6ee7b7',
      textTertiary: '#34d399',
      borderPrimary: '#1c4d3a7f',
      borderSecondary: '#276048c3',
      accentPrimary: '#34d399',
      accentHover: '#10b981',
      headerBg: '#0716123e',
      headerOpacity: 1,
      headerBorder: '#1c4d3a79',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#07161235',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#1c4d3a00',
      sidebarBg: '#0d261e5d',
      sidebarBorder: '#1c4d3a00',
      sidebarOpacity: 1,
      headerShadow: '#8e8e8e61',
      headerShadowBlur: 30,
      headerShadowSpread: -23,
      stickyHeaderShadow: '#6f6f6f7d',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -19,
      pageGradientFrom: '#071612',
      pageGradientVia: '#0d261e',
      pageGradientTo: '#071612',
      pageGlow: '#34d399c7',
      glowOpacity: 1,
    },
  },
  {
    name: 'Neon Rose',
    accent: '#0b0b14',
    colors: {
      bgPrimary: '#070712',
      bgSecondary: '#0b0b14',
      panelBg: DEFAULT_DARK_COLORS.panelBg,
      heroBg: DEFAULT_DARK_COLORS.heroBg,
      bgTertiary: DEFAULT_DARK_COLORS.bgTertiary,
      bgQuaternary: '#1f1f3a',
      textPrimary: '#f5f5f5',
      textSecondary: '#fbcfe8',
      textTertiary: '#fda4af',
      borderPrimary: '#1f1f3a7f',
      borderSecondary: '#2b2b55c3',
      accentPrimary: '#fb7185',
      accentHover: '#e11d48',
      headerBg: '#0707123e',
      headerOpacity: 1,
      headerBorder: '#1f1f3a79',
      headerMenuFontWeight: 600,
      stickyHeaderBg: '#07071235',
      stickyHeaderBlur: 15,
      stickyHeaderBorder: '#1f1f3a00',
      sidebarBg: '#0b0b145d',
      sidebarBorder: '#1f1f3a00',
      sidebarOpacity: 1,
      headerShadow: '#8e8e8e61',
      headerShadowBlur: 30,
      headerShadowSpread: -23,
      stickyHeaderShadow: '#6f6f6f7d',
      stickyHeaderShadowBlur: 30,
      stickyHeaderShadowSpread: -19,
      pageGradientFrom: '#070712',
      pageGradientVia: '#131326',
      pageGradientTo: '#000000',
      pageGlow: '#fb7185c7',
      glowOpacity: 1,
    },
  },
];
