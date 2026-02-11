import React from 'react';
import { formatDate } from '../lib/formatDate';
import { useFormatSettings } from './FormatSettingsProvider';

export default function BillingCard({ planName, status, expiresAt }: { planName?: string; status?: string; expiresAt?: string | null }) {
  const settings = useFormatSettings();

  return (
    <div className="rounded border border-neutral-800 p-4 bg-neutral-900/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-400">Plan</div>
          <div className="font-semibold">{planName || 'Free'}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-neutral-400">Status</div>
          <div className="font-medium">{status || 'FREE'}</div>
        </div>
      </div>
      {expiresAt ? (
        <div className="mt-3 text-xs text-neutral-500">
          Expires: {formatDate(expiresAt, { mode: settings.mode, timezone: settings.timezone })}
        </div>
      ) : null}
    </div>
  );
}
