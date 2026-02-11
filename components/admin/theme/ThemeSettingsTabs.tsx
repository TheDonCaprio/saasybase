"use client";

import { useCallback, useMemo, useState } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ThemeLink } from '../../../lib/settings';
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
  faArrowDown
} from '@fortawesome/free-solid-svg-icons';
import SimplePageEditor from '../pages/SimplePageEditor';

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
  initialBlogHtmlAfterLast
}: ThemeSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<string>('navigation');
  
  // Navigation state
  const [headerLinks, setHeaderLinks] = useState<ThemeLink[]>(() => 
    initialHeaderLinks.length ? initialHeaderLinks : [emptyLink()]
  );
  const [footerLinks, setFooterLinks] = useState<ThemeLink[]>(() => 
    initialFooterLinks.length ? initialFooterLinks : [emptyLink()]
  );
  const [footerText, setFooterText] = useState(initialFooterText);
  
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
          customBody
        })
      });

      if (!themeResponse.ok) {
        const error = await themeResponse.json().catch(() => ({ error: 'Failed to save theme settings' }));
        showToast(error.error || 'Failed to save theme settings', 'error');
        return;
      }

      // Save pricing settings
      const pricingPromises = [
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'PRICING_MAX_COLUMNS', value: pricingMaxColumns.toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'PRICING_CENTER_UNEVEN', value: pricingCenterUneven.toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_LISTING_STYLE', value: blogListingStyle })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_LISTING_PAGE_SIZE', value: blogListingPageSize.toString() })
        })
      ];

      const [maxColResponse, centerResponse, blogStyleResponse, blogPageSizeResponse] = await Promise.all(pricingPromises);

      if ([maxColResponse, centerResponse, blogStyleResponse, blogPageSizeResponse].some(res => !res.ok)) {
        showToast('Failed to save settings', 'error');
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
      
      // Save blog sidebar settings
      const sidebarPromises = [
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_ENABLED_INDEX', value: blogSidebarEnabledIndex.toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_ENABLED_ARCHIVE', value: blogSidebarEnabledArchive.toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_ENABLED_SINGLE', value: blogSidebarEnabledSingle.toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_ENABLED_PAGES', value: blogSidebarEnabledPages.toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_SHOW_RECENT', value: (!!recentWidget).toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_RECENT_COUNT', value: (recentWidget?.settings.recentCount || 5).toString() })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_CONTENT', value: richContentWidget?.settings.content || '' })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_HTML', value: htmlWidget?.settings.html || '' })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_SIDEBAR_WIDGET_ORDER', value: widgetOrderString })
        }),
        // HTML snippet insertion points for blog posts
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_HTML_BEFORE_FIRST_PARAGRAPH', value: blogHtmlBeforeFirst || '' })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_HTML_MIDDLE_OF_POST', value: blogHtmlMiddle || '' })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_HTML_AFTER_LAST_PARAGRAPH', value: blogHtmlAfterLast || '' })
        }),
        fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'BLOG_RELATED_POSTS_ENABLED', value: blogRelatedPostsEnabled.toString() })
        })
      ];

      const sidebarResponses = await Promise.all(sidebarPromises);
      if (sidebarResponses.some(res => !res.ok)) {
        showToast('Failed to save blog sidebar settings', 'error');
        return;
      }

      const themePayload = await themeResponse.json();
      setHeaderLinks(themePayload.headerLinks.length ? themePayload.headerLinks : [emptyLink()]);
      setFooterLinks(themePayload.footerLinks.length ? themePayload.footerLinks : [emptyLink()]);
      setFooterText(themePayload.footerText ?? '');
      setCustomCss(themePayload.customCss ?? '');
      setCustomHead(themePayload.customHead ?? '');
      setCustomBody(themePayload.customBody ?? themePayload.legacySnippet ?? '');
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
    blogRelatedPostsEnabled, blogHtmlBeforeFirst, blogHtmlMiddle, blogHtmlAfterLast
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
    blogHtmlBeforeFirst, blogHtmlMiddle, blogHtmlAfterLast
  ]);

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div
        className="relative flex overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-white shadow-[0_12px_45px_rgba(109,40,217,0.12)] transition-shadow dark:border-violet-500/40 dark:from-violet-500/15 dark:via-fuchsia-500/10 dark:to-transparent dark:shadow-[0_0_40px_rgba(168,85,247,0.18)]"
        role="tablist"
        aria-label="Theme settings sections"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.28),_transparent_60%)]" />
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
                ? 'bg-white text-slate-900 shadow-md dark:bg-black dark:text-neutral-100'
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