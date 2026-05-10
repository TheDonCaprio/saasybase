'use client';

import { useState } from 'react';
import { showToast } from '../ui/Toast';
import Image from 'next/image';
import { ImagePickerModal } from '../ui/ImagePickerModal';

function formatSettingLabel(key: string) {
  const MAP: Record<string, string> = {
    SITE_NAME: 'Site name',
    ANNOUNCEMENT_MESSAGE: 'Announcement',
    SUPPORT_EMAIL: 'Support email',
  SITE_LOGO: 'Logo (primary)',
    SITE_LOGO_LIGHT: 'Logo (light)',
  SITE_LOGO_DARK: 'Logo (dark)',
    SITE_LOGO_HEIGHT: 'Logo height',
    SITE_FAVICON: 'Favicon',
    FREE_PLAN_TOKEN_LIMIT: 'Free tokens',
    FREE_PLAN_RENEWAL_TYPE: 'Free plan renewal',
    FREE_PLAN_TOKEN_NAME: 'Free token name',
  DEFAULT_TOKEN_LABEL: 'Default token label',
  ENABLE_RECURRING_PRORATION: 'Enable recurring proration',
    MAINTENANCE_MODE: 'Maintenance mode',
    PRICING_MAX_COLUMNS: 'Pricing columns',
    PRICING_CENTER_UNEVEN: 'Pricing center uneven'
  };
  if (MAP[key]) return MAP[key];
  return key.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());
}
interface Setting {
  key: string;
  value: string;
  description?: string;
}

export interface EditableSettingsProps {
  databaseSettings: Setting[];
  environmentSettings?: Setting[];
  editableKeys?: string[];
  showHeading?: boolean;
  title?: string;
  description?: string;
  showEnvironment?: boolean;
}

export const DEFAULT_EDITABLE_SETTING_KEYS = [
  'MAINTENANCE_MODE',
  'FREE_PLAN_TOKEN_LIMIT',
  'FREE_PLAN_RENEWAL_TYPE',
  'FREE_PLAN_TOKEN_NAME',
  'DEFAULT_TOKEN_LABEL',
  'ENABLE_RECURRING_PRORATION',
  'SUPPORT_EMAIL',
  'ANNOUNCEMENT_MESSAGE',
  'SITE_NAME',
  'SITE_LOGO_HEIGHT',
  'SITE_LOGO',
  'SITE_FAVICON',
  'SITE_LOGO_LIGHT',
  'SITE_LOGO_DARK',
  'PRICING_MAX_COLUMNS',
  'PRICING_CENTER_UNEVEN'
];

export function EditableSettings({
  databaseSettings,
  environmentSettings,
  editableKeys,
  showHeading = true,
  title = 'Database Settings',
  description,
  showEnvironment = true
}: EditableSettingsProps) {
  const [showRawKeys, setShowRawKeys] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [settings, setSettings] = useState(databaseSettings);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [imagePickerKey, setImagePickerKey] = useState<string | null>(null);

  const keysToRender = (editableKeys?.length ? editableKeys : DEFAULT_EDITABLE_SETTING_KEYS).filter((key) =>
    DEFAULT_EDITABLE_SETTING_KEYS.includes(key)
  );

  const startEdit = (setting: Setting) => {
    setEditingKey(setting.key);
    setEditValue(setting.value);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const upsertSetting = (setting: Setting) => {
    setSettings((prev) => {
      const existing = prev.find((item) => item.key === setting.key);
      if (existing) {
        return prev.map((item) => (item.key === setting.key ? setting : item));
      }
      return [...prev, setting];
    });
  };

  const saveSettingValue = async (key: string, value: string) => {
    const response = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save setting');
    }

    const { setting } = await response.json();
    upsertSetting(setting);
    return setting as Setting;
  };

  const saveEdit = async (key: string) => {
    if (loading) return;
    setLoading(true);

    try {
      await saveSettingValue(key, editValue);
      cancelEdit();
    } catch (err: unknown) {
      const getErrorMessage = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e));
      console.error('Error saving setting:', getErrorMessage(err));
      showToast(`Error saving setting: ${getErrorMessage(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const closeImagePicker = () => {
    if (uploadingKey) return;
    setImagePickerKey(null);
  };

  const handleImageSelect = async (imageUrl: string) => {
    if (!imagePickerKey) return;

    setUploadingKey(imagePickerKey);
    try {
      await saveSettingValue(imagePickerKey, imageUrl);
      setImagePickerKey(null);
      showToast('Image updated', 'success');
    } catch (err: unknown) {
      const getErrorMessage = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e));
      console.error('Error saving image setting:', getErrorMessage(err));
      showToast(`Failed to save image setting: ${getErrorMessage(err)}`, 'error');
    } finally {
      setUploadingKey((current) => (current === imagePickerKey ? null : current));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        {showHeading && (
          <div className="mb-4 space-y-1">
            <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">
              {title}
            </h3>
            {description && <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">{description}</p>}
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <div />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-neutral-300">
              <input type="checkbox" className="h-4 w-4" checked={showRawKeys} onChange={() => setShowRawKeys((s) => !s)} />
              <span className="text-sm">Show raw keys</span>
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {keysToRender.map((key) => {
            const existing = settings.find((s) => s.key === key);
            const isEditing = editingKey === key;
            const isUploading = uploadingKey === key;
            const currentValue = existing?.value ?? '';
            const isImageKey = key === 'SITE_LOGO' || key === 'SITE_LOGO_LIGHT' || key === 'SITE_LOGO_DARK' || key === 'SITE_FAVICON';
            const isFaviconKey = key === 'SITE_FAVICON';

            return (
              <div
                key={key}
                className="group relative rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/40 p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-slate-300/80 dark:border-neutral-700/60 dark:from-neutral-800/80 dark:to-neutral-900/40 dark:hover:border-neutral-600/80"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{formatSettingLabel(key)}</h3>
                        {showRawKeys && <div className="mt-0.5 font-mono text-xs text-blue-600/70 dark:text-blue-400/70">{key}</div>}
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        {isImageKey && !isEditing && (
                          <button
                            type="button"
                            onClick={() => setImagePickerKey(key)}
                            disabled={isUploading}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${isUploading ? 'cursor-wait border-blue-200 bg-blue-50 text-blue-700 opacity-80 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-400' : 'cursor-pointer border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            {isUploading ? 'Saving...' : 'Upload'}
                          </button>
                        )}
                        
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => saveEdit(key)}
                              disabled={loading}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={loading}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit({ key, value: currentValue, description: existing?.description })}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100 hover:border-indigo-300 dark:border-indigo-700/50 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Value display and input area */}
                    <div className="mt-4">
                      {isEditing ? (
                        <div className="space-y-2">
                          {key === 'SITE_LOGO_HEIGHT' ? (
                            <input
                              type="number"
                              min={8}
                              max={400}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              placeholder="Logo height in pixels (e.g. 48)"
                              autoFocus
                            />
                          ) : key === 'FREE_PLAN_TOKEN_LIMIT' ? (
                            <input
                              type="number"
                              min={0}
                              max={999999}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              placeholder="Number of free tokens (0 = no access)"
                              autoFocus
                            />
                          ) : key === 'FREE_PLAN_RENEWAL_TYPE' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              autoFocus
                            >
                              <option value="one-time">One-time (never renew)</option>
                              <option value="daily">Daily (renew each day)</option>
                              <option value="monthly">Monthly (renew each month)</option>
                              <option value="unlimited">Unlimited (no token limit)</option>
                            </select>
                          ) : key === 'FREE_PLAN_TOKEN_NAME' ? (
                            <input
                              type="text"
                              maxLength={50}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              placeholder="Custom token name (leave empty for default)"
                              autoFocus
                            />
                          ) : key === 'PRICING_MAX_COLUMNS' ? (
                            <input
                              type="number"
                              min={0}
                              max={6}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              placeholder="Maximum columns (0 = unlimited, auto-fit)"
                              autoFocus
                            />
                          ) : key === 'PRICING_CENTER_UNEVEN' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              autoFocus
                            >
                              <option value="false">Disabled (left-aligned)</option>
                              <option value="true">Enabled (center when count &lt; max)</option>
                            </select>
                          ) : key === 'MAINTENANCE_MODE' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              autoFocus
                            >
                              <option value="false">Disabled</option>
                              <option value="true">Enabled</option>
                            </select>
                          ) : key === 'ENABLE_RECURRING_PRORATION' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              autoFocus
                            >
                              <option value="false">Disabled</option>
                              <option value="true">Enabled</option>
                            </select>
                          ) : key === 'DEFAULT_TOKEN_LABEL' ? (
                            <input
                              type="text"
                              maxLength={50}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              placeholder="Default token label (e.g. 'tokens', 'credits')"
                              autoFocus
                            />
                          ) : (
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400"
                              placeholder="Enter value..."
                              rows={key.includes('ANNOUNCEMENT') || key.includes('MESSAGE') ? 3 : 1}
                              autoFocus
                            />
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200/60 bg-slate-50/40 px-4 py-3 dark:border-neutral-700/60 dark:bg-neutral-800/40">
                          {currentValue ? (
                            isImageKey && (currentValue.startsWith('/') || /^(https?:)?\/\//.test(currentValue)) ? (
                              <div className="flex items-center gap-3">
                                {isFaviconKey ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={currentValue}
                                      alt="Site favicon"
                                      width={40}
                                      height={40}
                                      className="h-10 w-10 rounded border border-slate-200 bg-white object-contain p-1 dark:border-neutral-600 dark:bg-neutral-800"
                                    />
                                  </>
                                ) : (
                                  <div className="flex-shrink-0">
                                    <Image src={currentValue} alt="Site logo" width={96} height={24} className="h-6 w-auto rounded object-contain" />
                                  </div>
                                )}
                                <div className="break-all text-sm text-slate-600 dark:text-neutral-400 font-mono">{currentValue}</div>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-700 dark:text-neutral-300">{currentValue}</div>
                            )
                          ) : (
                            <span className="text-sm italic text-slate-400 dark:text-neutral-500">Not configured</span>
                          )}
                          {isUploading && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Uploading...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showEnvironment && environmentSettings && environmentSettings.length > 0 && (
        <EnvironmentSettingsList settings={environmentSettings} showRawKeys={showRawKeys} />
      )}

      <ImagePickerModal
        isOpen={Boolean(imagePickerKey)}
        onClose={closeImagePicker}
        onSelectImage={(imageUrl) => {
          void handleImageSelect(imageUrl);
        }}
        title={imagePickerKey ? `Select ${formatSettingLabel(imagePickerKey)}` : 'Select image'}
        allowUpload
        uploadScope="logo"
      />
    </div>
  );
}

interface EnvironmentSettingsListProps {
  settings: Setting[];
  title?: string;
  description?: string;
  badgeText?: string;
  showRawKeys?: boolean;
}

export function EnvironmentSettingsList({
  settings,
  title = 'Environment Settings',
  description,
  badgeText = 'Read-only',
  showRawKeys = true
}: EnvironmentSettingsListProps) {
  if (!settings.length) return null;

  return (
    <div className="space-y-3">
      <div className="mb-4 space-y-1">
        <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">
          {title}
          {badgeText && (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-700 dark:text-neutral-300">{badgeText}</span>
          )}
        </h3>
        {description && <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">{description}</p>}
      </div>
      {settings.map((setting) => (
        <div
          key={setting.key}
          className="group relative rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/40 p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-slate-300/80 dark:border-neutral-700/60 dark:from-neutral-800/80 dark:to-neutral-900/40 dark:hover:border-neutral-600/80"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              {showRawKeys && (
                <div className="font-mono text-sm font-semibold text-slate-900 dark:text-neutral-100">{setting.key}</div>
              )}
              {setting.description && (
                <div className={`text-sm text-slate-600 dark:text-neutral-400 ${showRawKeys ? 'mt-1' : ''}`}>
                  {setting.description}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200/60 bg-slate-50/40 px-4 py-3 dark:border-neutral-700/60 dark:bg-neutral-800/40">
              <div className="break-all text-sm font-medium text-slate-700 dark:text-neutral-100 font-mono">
                {setting.value}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default EditableSettings;
