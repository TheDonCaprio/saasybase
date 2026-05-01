"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  faArrowRotateLeft, 
  faFloppyDisk,
  faPalette,
  faFileExport,
  faFileImport,
} from '@fortawesome/free-solid-svg-icons';

import {
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  type ColorTokens,
  type ThemeColorPalette,
  type ThemeColorPreset,
} from './colorPaletteData';
import { NavigationTabContent } from './panels/NavigationTabContent';
import { ContentTabContent } from './panels/ContentTabContent';
import { ColorTabContent } from './panels/ColorTabContent';
import { LayoutTabContent } from './panels/LayoutTabContent';
import { CodeTabContent } from './panels/CodeTabContent';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { validateThemeCustomCss, validateThemeCustomMarkup } from '../../../lib/theme-custom-code';

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
  isContentSecurityPolicyEnabled: boolean;
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

export function ThemeSettingsTabs({
  isContentSecurityPolicyEnabled,
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
  const resolveThemeFontStack = useCallback((fontFamily: ColorTokens['fontFamily'] | undefined): string => {
    switch (fontFamily) {
      case 'carbon':
        return 'Arial, "Helvetica Neue", Helvetica, sans-serif';
      case 'polaris':
        return 'Verdana, "Segoe UI", Arial, sans-serif';
      case 'ant':
        return '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
      case 'spectrum':
        return '"Segoe UI", Tahoma, Arial, sans-serif';
      case 'geist':
        return '"Helvetica Neue", Helvetica, Arial, sans-serif';
      case 'material':
        return 'Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif';
      case 'fluent':
        return '"Segoe UI Variable Text", "Segoe UI", Selawik, Tahoma, Arial, sans-serif';
      case 'apple':
        return '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
      case 'system':
      default:
        return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    }
  }, []);

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

    const buildBlock = (t: ColorTokens) => {
      const headerBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(t.headerBlur) ? t.headerBlur : 12)));
      const headerBorderWidthPx = Math.max(0, Math.min(4, Math.round(Number.isFinite(t.headerBorderWidth) ? t.headerBorderWidth : 1)));
      const headerMenuFontSizePx = Math.max(10, Math.min(20, Math.round(Number.isFinite(t.headerMenuFontSize) ? t.headerMenuFontSize : 14)));
      const headerMenuFontWeight = Math.max(300, Math.min(800, Math.round(Number.isFinite(t.headerMenuFontWeight) ? t.headerMenuFontWeight : 400)));

      const stickyHeaderBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(t.stickyHeaderBlur) ? t.stickyHeaderBlur : 14)));
      const stickyHeaderBorderWidthPx = Math.max(0, Math.min(4, Math.round(Number.isFinite(t.stickyHeaderBorderWidth) ? t.stickyHeaderBorderWidth : 1)));

      const headerShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(t.headerShadowBlur) ? t.headerShadowBlur : 30)));
      const headerShadowSpreadPx = Math.max(-80, Math.min(80, Math.round(Number.isFinite(t.headerShadowSpread) ? t.headerShadowSpread : -22)));
      const cardShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(t.cardShadowBlur) ? t.cardShadowBlur : 24)));
      const cardShadowSpreadPx = Math.max(-80, Math.min(80, Math.round(Number.isFinite(t.cardShadowSpread) ? t.cardShadowSpread : -18)));
      const panelShadowBlurPx = Math.max(
        0,
        Math.min(80, Math.round(Number.isFinite(t.panelShadowBlur) ? t.panelShadowBlur : cardShadowBlurPx)),
      );
      const panelShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(t.panelShadowSpread) ? t.panelShadowSpread : cardShadowSpreadPx)),
      );
      const tabsShadowBlurPx = Math.max(
        0,
        Math.min(80, Math.round(Number.isFinite(t.tabsShadowBlur) ? t.tabsShadowBlur : cardShadowBlurPx)),
      );
      const tabsShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(t.tabsShadowSpread) ? t.tabsShadowSpread : cardShadowSpreadPx)),
      );
      const sidebarShadowBlurPx = Math.max(
        0,
        Math.min(80, Math.round(Number.isFinite(t.sidebarShadowBlur) ? t.sidebarShadowBlur : panelShadowBlurPx)),
      );
      const sidebarShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(t.sidebarShadowSpread) ? t.sidebarShadowSpread : panelShadowSpreadPx)),
      );
      const stickyHeaderShadowBlurPx = Math.max(
        0,
        Math.min(80, Math.round(Number.isFinite(t.stickyHeaderShadowBlur) ? t.stickyHeaderShadowBlur : headerShadowBlurPx)),
      );
      const stickyHeaderShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(t.stickyHeaderShadowSpread) ? t.stickyHeaderShadowSpread : headerShadowSpreadPx)),
      );
      const surfaceRadiusPx = Math.max(0, Math.min(32, Math.round(Number.isFinite(t.surfaceRadius) ? t.surfaceRadius : 16)));
      const statCardAccentTopPx = Math.max(0, Math.min(8, Math.round(Number.isFinite(t.statCardAccentTop) ? t.statCardAccentTop : 0)));
      const statCardAccentLeftPx = Math.max(0, Math.min(8, Math.round(Number.isFinite(t.statCardAccentLeft) ? t.statCardAccentLeft : 0)));
      const fontFamily = resolveThemeFontStack(t.fontFamily);

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
      const sidebarBorder = parseHexColor(t.sidebarBorder ?? t.borderPrimary);
      const pageGlow = parseHexColor(t.pageGlow);
      const headerShadow = parseHexColor(t.headerShadow ?? '#00000014');
      const panelShadow = parseHexColor(t.panelShadow ?? t.cardShadow ?? '#00000012');
      const cardShadow = parseHexColor(t.cardShadow ?? '#00000014');
      const tabsShadow = parseHexColor(t.tabsShadow ?? t.cardShadow ?? '#00000010');
      const sidebarShadow = parseHexColor(t.sidebarShadow ?? t.panelShadow ?? t.headerShadow ?? '#00000010');
      const stickyHeaderShadow = parseHexColor(
        t.stickyHeaderShadow ?? t.headerShadow ?? '#00000014'
      );

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
        `  --theme-header-menu-font-size: ${headerMenuFontSizePx}px;`,
        `  --theme-header-menu-font-weight: ${headerMenuFontWeight};`,
        `  --theme-font-family: ${fontFamily};`,
        `  --theme-sticky-header-bg: rgb(${stickyHeaderBg.rgb} / ${fmtAlpha(stickyHeaderBg.a)});`,
        `  --theme-sticky-header-text: rgb(${stickyHeaderText.rgb} / ${fmtAlpha(stickyHeaderText.a)});`,
        `  --theme-sticky-header-blur: ${stickyHeaderBlurPx}px;`,
        `  --theme-sticky-header-border: rgb(${stickyHeaderBorder.rgb} / ${fmtAlpha(stickyHeaderBorder.a)});`,
        `  --theme-sticky-header-border-width: ${stickyHeaderBorderWidthPx}px;`,
        `  --theme-sidebar-bg: rgb(${sidebarBg.rgb} / ${fmtAlpha(sidebarBg.a)});`,
        `  --theme-sidebar-border: rgb(${sidebarBorder.rgb} / ${fmtAlpha(sidebarBorder.a)});`,
        `  --theme-header-shadow: 0 12px ${headerShadowBlurPx}px ${headerShadowSpreadPx}px rgb(${headerShadow.rgb} / ${fmtAlpha(headerShadow.a)});`,
        `  --theme-panel-shadow: 0 12px ${panelShadowBlurPx}px ${panelShadowSpreadPx}px rgb(${panelShadow.rgb} / ${fmtAlpha(panelShadow.a)});`,
        `  --theme-card-shadow: 0 12px ${cardShadowBlurPx}px ${cardShadowSpreadPx}px rgb(${cardShadow.rgb} / ${fmtAlpha(cardShadow.a)});`,
        `  --theme-tabs-shadow: 0 12px ${tabsShadowBlurPx}px ${tabsShadowSpreadPx}px rgb(${tabsShadow.rgb} / ${fmtAlpha(tabsShadow.a)});`,
        `  --theme-sidebar-shadow: 0 12px ${sidebarShadowBlurPx}px ${sidebarShadowSpreadPx}px rgb(${sidebarShadow.rgb} / ${fmtAlpha(sidebarShadow.a)});`,
        `  --theme-sticky-header-shadow: 0 12px ${stickyHeaderShadowBlurPx}px ${stickyHeaderShadowSpreadPx}px rgb(${stickyHeaderShadow.rgb} / ${fmtAlpha(stickyHeaderShadow.a)});`,
        `  --theme-surface-radius: ${surfaceRadiusPx}px;`,
        `  --theme-stat-card-accent-top: ${statCardAccentTopPx}px;`,
        `  --theme-stat-card-accent-left: ${statCardAccentLeftPx}px;`,
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

    const css = `html.light {\n${buildBlock(palette.light)}\n}\nhtml.dark {\n${buildBlock(palette.dark)}\n}`;
    const styleId = 'runtime-theme-color-vars';
    let tag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = styleId;
      tag.setAttribute('data-theme-color-vars', 'runtime');
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [fmtAlpha, parseHexColor, resolveThemeFontStack]);
  
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
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [themeExporting, setThemeExporting] = useState(false);
  const [themeImporting, setThemeImporting] = useState(false);
  const themeImportInputRef = useRef<HTMLInputElement>(null);
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

    const cssValidationError = validateThemeCustomCss(customCss);
    if (cssValidationError) {
      showToast(cssValidationError, 'error');
      return;
    }

    const headValidationError = validateThemeCustomMarkup('head', customHead);
    if (headValidationError) {
      showToast(headValidationError, 'error');
      return;
    }

    const bodyValidationError = validateThemeCustomMarkup('body', customBody);
    if (bodyValidationError) {
      showToast(bodyValidationError, 'error');
      return;
    }

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

      // Snap local UI state to the effective persisted values.
      // This prevents confusing "it reset" moments (e.g. when a user typed 0 or out-of-range).
      setHeaderHeight(safeHeaderHeight);
      setHeaderStickyScrollY(safeStickyScrollY);
      setHeaderStickyHeight(safeStickyHeight);

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
  }, [applyPaletteToDocument, resetting]);

  const handleThemeExport = useCallback(async () => {
    if (themeExporting) return;
    setThemeExporting(true);
    try {
      const res = await fetch('/api/admin/theme/export');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        showToast(err?.error || 'Failed to export theme', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      a.download = match?.[1] || `theme-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Theme exported successfully', 'success');
    } catch {
      showToast('Unexpected error exporting theme', 'error');
    } finally {
      setThemeExporting(false);
    }
  }, [themeExporting]);

  const handleThemeImport = useCallback(async (file: File) => {
    if (themeImporting) return;
    setThemeImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        showToast('Invalid JSON file', 'error');
        return;
      }
      const res = await fetch('/api/admin/theme/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({ error: 'Import failed' }));
      if (!res.ok) {
        showToast(data?.error || 'Failed to import theme', 'error');
        return;
      }
      const msg = data.skipped
        ? `Imported ${data.imported} theme settings (${data.skipped} skipped). Reload to see changes.`
        : `Imported ${data.imported} theme settings. Reload to see changes.`;
      showToast(msg, 'success');
      // Refresh the page to load the updated theme values
      router.refresh();
    } catch {
      showToast('Unexpected error importing theme', 'error');
    } finally {
      setThemeImporting(false);
      if (themeImportInputRef.current) themeImportInputRef.current.value = '';
    }
  }, [themeImporting, router]);

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
        <NavigationTabContent
          headerLinks={headerLinks}
          footerLinks={footerLinks}
          footerText={footerText}
          footerTokenHints={footerTokenHints}
          canAddHeader={canAddHeader}
          canAddFooter={canAddFooter}
          addHeaderLink={addHeaderLink}
          addFooterLink={addFooterLink}
          updateHeaderLink={updateHeaderLink}
          updateFooterLink={updateFooterLink}
          removeHeaderLink={removeHeaderLink}
          removeFooterLink={removeFooterLink}
          setFooterText={setFooterText}
        />
      )
    },
    {
      id: 'content',
      label: 'Content',
      icon: faNewspaper,
      description: 'Blog listings and sidebar configuration',
      content: (
        <ContentTabContent
          blogListingStyle={blogListingStyle}
          setBlogListingStyle={setBlogListingStyle}
          blogListingPageSize={blogListingPageSize}
          setBlogListingPageSize={setBlogListingPageSize}
          blogSidebarEnabledIndex={blogSidebarEnabledIndex}
          setBlogSidebarEnabledIndex={setBlogSidebarEnabledIndex}
          blogSidebarEnabledSingle={blogSidebarEnabledSingle}
          setBlogSidebarEnabledSingle={setBlogSidebarEnabledSingle}
          blogSidebarEnabledArchive={blogSidebarEnabledArchive}
          setBlogSidebarEnabledArchive={setBlogSidebarEnabledArchive}
          blogSidebarEnabledPages={blogSidebarEnabledPages}
          setBlogSidebarEnabledPages={setBlogSidebarEnabledPages}
          blogRelatedPostsEnabled={blogRelatedPostsEnabled}
          setBlogRelatedPostsEnabled={setBlogRelatedPostsEnabled}
          blogHtmlBeforeFirst={blogHtmlBeforeFirst}
          setBlogHtmlBeforeFirst={setBlogHtmlBeforeFirst}
          blogHtmlMiddle={blogHtmlMiddle}
          setBlogHtmlMiddle={setBlogHtmlMiddle}
          blogHtmlAfterLast={blogHtmlAfterLast}
          setBlogHtmlAfterLast={setBlogHtmlAfterLast}
          sidebarWidgets={sidebarWidgets}
          addWidget={addWidget}
          removeWidget={removeWidget}
          toggleWidget={toggleWidget}
          updateWidgetSettings={updateWidgetSettings}
          updateWidgetTitle={updateWidgetTitle}
          moveWidget={moveWidget}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
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
          onSelectDefaultPreset={() => {
            setHeaderStyle('center-nav');
            setHeaderHeight(60);
            setHeaderStickyEnabled(true);
            setHeaderStickyScrollY(100);
            setHeaderStickyHeight(50);
          }}
        />
      )
    },
    {
      id: 'layout',
      label: 'Layout',
      icon: faTableCells,
      description: 'Pricing cards and page structure',
      content: (
        <LayoutTabContent
          headerStyle={headerStyle}
          setHeaderStyle={setHeaderStyle}
          headerHeight={headerHeight}
          setHeaderHeight={setHeaderHeight}
          headerStickyEnabled={headerStickyEnabled}
          setHeaderStickyEnabled={setHeaderStickyEnabled}
          headerStickyScrollY={headerStickyScrollY}
          setHeaderStickyScrollY={setHeaderStickyScrollY}
          headerStickyHeight={headerStickyHeight}
          setHeaderStickyHeight={setHeaderStickyHeight}
          lightColors={lightColors}
          setLightColors={setLightColors}
          darkColors={darkColors}
          setDarkColors={setDarkColors}
          pricingMaxColumns={pricingMaxColumns}
          setPricingMaxColumns={setPricingMaxColumns}
          pricingCenterUneven={pricingCenterUneven}
          setPricingCenterUneven={setPricingCenterUneven}
        />
      )
    },
    {
      id: 'code',
      label: 'Code',
      icon: faCode,
      description: 'Custom CSS, HTML head, and body snippets',
      content: (
        <CodeTabContent
          isContentSecurityPolicyEnabled={isContentSecurityPolicyEnabled}
          customCss={customCss}
          setCustomCss={setCustomCss}
          customHead={customHead}
          setCustomHead={setCustomHead}
          customBody={customBody}
          setCustomBody={setCustomBody}
        />
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
    isContentSecurityPolicyEnabled,
    blogHtmlBeforeFirst, blogHtmlMiddle, blogHtmlAfterLast,
    colorPresets, handleDeleteColorPreset, handleSaveColorPreset,
    lightColors, darkColors, colorMode, setColorMode,
  ]);

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const activeTabIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeContent.id));
  const tabSelectorRadius = 'max(calc(var(--theme-surface-radius) - 4px), 4px)';

  return (
    <div className="space-y-6">
      <div
        className="relative overflow-x-auto rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[linear-gradient(135deg,var(--theme-tabs-gradient-from),var(--theme-tabs-gradient-via),var(--theme-tabs-gradient-to))] p-1 transition-shadow"
        style={{ boxShadow: 'var(--theme-tabs-shadow)' }}
        role="tablist"
        aria-label="Theme settings sections"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-1 top-1 z-0 hidden transition-transform duration-200 ease-out sm:block"
          style={{
            width: `calc((100% - 8px) / ${tabs.length})`,
            transform: `translateX(${activeTabIndex * 100}%)`,
            borderRadius: tabSelectorRadius,
            backgroundColor: 'rgb(var(--surface-panel-rgb) / calc(var(--surface-panel-a) * 0.96))',
            border: '1px solid rgb(var(--border-primary-rgb) / calc(var(--border-primary-a) * 0.55))',
            boxShadow: 'var(--theme-panel-shadow)',
          }}
        />
        <div className="flex min-w-max sm:min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                'relative z-10 inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors sm:px-6',
                activeTab === tab.id
                  ? 'bg-transparent text-[rgb(var(--accent-primary))] dark:text-[rgb(var(--accent-primary))]'
                  : 'text-slate-700/85 hover:bg-white/60 hover:text-slate-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-neutral-50'
              )}
              style={{ borderRadius: tabSelectorRadius }}
            >
              <FontAwesomeIcon icon={tab.icon} className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${activeContent.id}-tab`}
        className="rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--surface-panel-rgb)_/_calc(var(--surface-panel-a)*0.88))] p-6"
        style={{ boxShadow: 'var(--theme-panel-shadow)' }}
      >
        {activeContent.content}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsResetConfirmOpen(true)}
            disabled={resetting || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <FontAwesomeIcon icon={faArrowRotateLeft} className="h-4 w-4" />
            {resetting ? 'Resetting…' : 'Restore defaults'}
          </button>
          <input
            ref={themeImportInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleThemeImport(file);
            }}
          />
          <button
            type="button"
            onClick={() => themeImportInputRef.current?.click()}
            disabled={themeImporting || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <FontAwesomeIcon icon={faFileImport} className="h-4 w-4" />
            {themeImporting ? 'Importing…' : 'Import theme'}
          </button>
          <button
            type="button"
            onClick={handleThemeExport}
            disabled={themeExporting || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <FontAwesomeIcon icon={faFileExport} className="h-4 w-4" />
            {themeExporting ? 'Exporting…' : 'Export theme'}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm transition-colors hover:bg-blue-700 hover:!text-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-blue-500/40 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          <FontAwesomeIcon icon={faFloppyDisk} className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Restore theme defaults?"
        description="This will reset navigation, footer, colors, layout, and theme code snippets back to their default values."
        confirmLabel={resetting ? 'Restoring…' : 'Restore defaults'}
        loading={resetting}
        onClose={() => {
          if (!resetting) setIsResetConfirmOpen(false);
        }}
        onConfirm={async () => {
          await handleReset();
          setIsResetConfirmOpen(false);
        }}
      />
    </div>
  );
}