"use client";
import React, { useEffect, useState } from 'react';

const DEFAULT_MODE = 'short';

// Sample date for preview
const SAMPLE_DATE = new Date('2025-09-12T15:45:30Z');

const FORMAT_OPTIONS = [
  { 
    value: 'short', 
    label: 'Short Date', 
    description: 'Compact date format',
    example: 'Sep 12, 2025'
  },
  { 
    value: 'long', 
    label: 'Long Date', 
    description: 'Full date with day name',
    example: 'Thursday, September 12, 2025'
  },
  { 
    value: 'datetime', 
    label: 'Date + Time', 
    description: 'Date with time included',
    example: 'Sep 12, 2025, 3:45 PM'
  },
  { 
    value: 'datetime-long', 
    label: 'Full Date + Time', 
    description: 'Complete date and time',
    example: 'September 12, 2025 at 3:45 PM'
  },
  { 
    value: 'iso', 
    label: 'ISO Format', 
    description: 'Technical ISO timestamp',
    example: '2025-09-12T15:45:30Z'
  },
  { 
    value: 'relative', 
    label: 'Relative Time', 
    description: 'Human-friendly relative dates',
    example: 'in 2 days, 3 hours ago'
  },
  { 
    value: 'locale', 
    label: 'User Locale', 
    description: 'Based on user browser settings',
    example: 'Varies by user location'
  }
];

// Extend with the new presets requested
FORMAT_OPTIONS.splice(FORMAT_OPTIONS.length - 1, 0,
  {
    value: 'short-time-24',
    label: 'Short (24h)',
    description: 'Compact month/day with 24-hour time',
    example: 'Mar 10 (23:59)'
  },
  {
    value: 'short-year-time-24',
    label: 'Short with year (24h)',
    description: 'Compact month/day/year with 24-hour time',
    example: 'Mar 10, 2026 (23:59)'
  },
  {
    value: 'numeric-dmy-12',
    label: 'Numeric DMY (12h)',
    description: 'Day/Month/Year with 12-hour time',
    example: '10/03/2026 (11:59 PM)'
  },
  {
    value: 'numeric-dmy-24',
    label: 'Numeric DMY (24h)',
    description: 'Day/Month/Year with 24-hour time',
    example: '10/03/2026 (23:59)'
  }
);

import TIMEZONES from '../../lib/timezones';
import { formatDate, type FormatMode } from '../../lib/formatDate';

// Admin presets: keep an Auto option but otherwise reuse the curated list
const TIMEZONE_PRESETS = [
  { value: '', label: 'Auto (User\'s timezone)' },
  ...TIMEZONES
];

export default function AdminSettingsForm() {
  const [mode, setMode] = useState<string>(DEFAULT_MODE);
  const [timezone, setTimezone] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [showCustomTimezone, setShowCustomTimezone] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch('/api/admin/settings?key=format.mode');
        if (!res.ok) return;
        const json = await res.json();
        if (!mounted) return;
        setMode(json.value || DEFAULT_MODE);
      } catch (e) {
        void e;
        // ignore
      }

      try {
        const res2 = await fetch('/api/admin/settings?key=format.timezone');
        if (!res2.ok) return;
        const json2 = await res2.json();
        if (!mounted) return;
        const timezoneValue = json2.value || '';
        setTimezone(timezoneValue);
        // Check if it's a custom timezone (not in presets)
        const isPreset = TIMEZONE_PRESETS.some(preset => preset.value === timezoneValue);
        setShowCustomTimezone(!isPreset && timezoneValue !== '');
      } catch (e) {
        void e;
        // intentionally ignored - network/read fallback
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function save() {
    setLoading(true);
    setMsg('');
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'format.mode', value: mode })
      });
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'format.timezone', value: timezone })
      });
      setMsg('Settings saved successfully!');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      void e;
      setMsg('Failed to save settings');
      setTimeout(() => setMsg(''), 3000);
    } finally {
      setLoading(false);
    }
  }

  const handleTimezoneChange = (value: string) => {
    setTimezone(value);
    if (value === 'custom') {
      setShowCustomTimezone(true);
      setTimezone('');
    } else {
      setShowCustomTimezone(false);
    }
  };

  const selectedFormat = FORMAT_OPTIONS.find(opt => opt.value === mode) || FORMAT_OPTIONS[0];
  // Compute live preview using formatDate so the example matches actual rendering
  const previewTimezone = showCustomTimezone ? (timezone || undefined) : (timezone || undefined);
  const computedPreview = (() => {
    try {
      return formatDate(SAMPLE_DATE, { mode: mode as FormatMode, timezone: previewTimezone });
    } catch {
      return selectedFormat.example;
    }
  })();

  return (
    <div className="space-y-6">
      {/* Date Format Selection */}
      <div>
        <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-300 mb-3">
          Date Format Mode
        </label>
        <div className="grid gap-3">
          {FORMAT_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-3 p-3 border border-neutral-700 rounded-lg hover:border-neutral-600 transition-colors cursor-pointer">
              <input
                type="radio"
                name="dateFormat"
                value={option.value}
                checked={mode === option.value}
                onChange={(e) => setMode(e.target.value)}
                className="mt-1 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{option.label}</span>
                  <span className="text-xs text-neutral-100 font-mono bg-neutral-800 px-2 py-1 rounded">
                    {option.example}
                  </span>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      

      {/* Current Preview */}
      <div className="bg-neutral-800/50 border border-neutral-600 rounded-lg p-4">
        <h4 className="text-sm font-medium text-neutral-300 mb-2">Preview</h4>
        <div className="font-mono text-sm text-emerald-400">
          Current format: &quot;{computedPreview}&quot;
        </div>
        <div className="text-xs text-neutral-500 mt-1">
          This is how dates will appear throughout the application
        </div>
      </div>

      {/* Timezone Selection */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Default Timezone
        </label>
        <select 
          value={showCustomTimezone ? 'custom' : timezone} 
          onChange={(e) => handleTimezoneChange(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {TIMEZONE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
          <option value="custom">Custom timezone...</option>
        </select>
        
        {showCustomTimezone && (
          <div className="mt-2">
            <input 
              type="text"
              value={timezone} 
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g., America/New_York, Europe/Berlin"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Enter a valid timezone identifier (e.g., America/New_York). 
              <a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline ml-1">
                View full list
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Save Button and Status */}
      <div className="flex items-center justify-between pt-4 border-t border-neutral-700">
        <div className="flex items-center gap-3">
          <button 
            disabled={loading} 
            onClick={save} 
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                Saving...
              </div>
            ) : (
              'Save Settings'
            )}
          </button>
          {msg && (
            <div className={`text-sm ${msg.includes('success') ? 'text-emerald-400' : 'text-red-400'} flex items-center gap-1`}>
              {msg.includes('success') ? '✓' : '✗'} {msg}
            </div>
          )}
        </div>
        
        <div className="text-xs text-neutral-500">
          Changes apply immediately across the application
        </div>
      </div>
    </div>
  );
}
