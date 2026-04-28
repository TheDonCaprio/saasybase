"use client";

import { useState } from 'react';
import { showToast } from '../../../ui/Toast';
import type { TrafficAnalyticsProviderHealth, TrafficAnalyticsProviderKey } from '../../../../lib/traffic-analytics-config';

interface TrafficAnalyticsSettingsPanelProps {
  initialHealth: TrafficAnalyticsProviderHealth;
}

const PROVIDER_OPTIONS: Array<{ value: TrafficAnalyticsProviderKey; label: string; description: string }> = [
  {
    value: 'google-analytics',
    label: 'Google Analytics',
    description: 'Uses GA4 Measurement ID tracking and the Data API for dashboard reports.',
  },
  {
    value: 'posthog',
    label: 'PostHog',
    description: 'Uses PostHog pageview capture on the frontend and Query API reads for dashboard reports.',
  },
];

export function TrafficAnalyticsSettingsPanel({ initialHealth }: TrafficAnalyticsSettingsPanelProps) {
  const [health, setHealth] = useState(initialHealth);
  const [selectedProvider, setSelectedProvider] = useState<TrafficAnalyticsProviderKey>(initialHealth.activeProvider.provider);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshHealth = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/admin/traffic/provider-status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load analytics provider status');
      const payload = (await response.json()) as TrafficAnalyticsProviderHealth;
      setHealth(payload);
      setSelectedProvider(payload.activeProvider.provider);
    } catch {
      showToast('Failed to refresh analytics provider status', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const saveProvider = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'TRAFFIC_ANALYTICS_PROVIDER', value: selectedProvider }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save analytics provider');
      }

      showToast('Traffic analytics provider updated', 'success');
      await refreshHealth();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save analytics provider', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">


      <div className="grid gap-4 lg:grid-cols-2">
        {PROVIDER_OPTIONS.map((option) => {
          const active = selectedProvider === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedProvider(option.value)}
              className={[
                'rounded-[var(--theme-surface-radius)] border p-5 text-left transition-colors',
                active
                  ? 'border-indigo-400 bg-indigo-50/80 text-indigo-950 dark:border-indigo-400/60 dark:bg-indigo-500/10 dark:text-indigo-100'
                  : 'border-slate-200 bg-white text-slate-800 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">{option.description}</p>
                </div>
                <span
                  className={[
                    'mt-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-semibold',
                    active
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-300 text-slate-400 dark:border-neutral-600 dark:text-neutral-500',
                  ].join(' ')}
                >
                  {active ? 'ON' : ''}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveProvider}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save provider'}
        </button>
        <button
          type="button"
          onClick={refreshHealth}
          disabled={refreshing}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-slate-50/70 p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Google Analytics</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">Measurement ID + GA Data API credentials</p>
            </div>
            <span className={health.googleAnalytics.available ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
              {health.googleAnalytics.available ? 'Healthy' : 'Missing config'}
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-neutral-300">
            <li>Measurement ID: {health.googleAnalytics.measurementIdSet ? 'configured' : 'missing'}</li>
            <li>Property ID: {health.googleAnalytics.propertyIdSet ? 'configured' : 'missing'}</li>
            <li>Service account credentials: {health.googleAnalytics.credentialsSet ? 'configured' : 'missing'}</li>
          </ul>
        </div>

        <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-slate-50/70 p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">PostHog</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">Project API key + Query API credentials</p>
            </div>
            <span className={health.postHog.available ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
              {health.postHog.available ? 'Healthy' : 'Missing config'}
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-neutral-300">
            <li>Project ID: {health.postHog.projectIdSet ? 'configured' : 'missing'}</li>
            <li>Personal API key: {health.postHog.personalApiKeySet ? 'configured' : 'missing'}</li>
            <li>Project API key: {health.postHog.projectApiKeySet ? 'configured' : 'missing'}</li>
            <li>App host: {health.postHog.appHost}</li>
            <li>API host: {health.postHog.apiHost}</li>
          </ul>
        </div>
      </div>

      <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <p className="font-semibold">Active provider</p>
        <p className="mt-1">
          {health.activeProvider.provider} via {health.activeProvider.source}
        </p>
      </div>
    </div>
  );
}