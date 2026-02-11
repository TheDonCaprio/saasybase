"use client";
import React from 'react';
import { asRecord, toError } from '../../lib/runtime-guards';

export default function ActivatePendingButton({ subscriptionId, label = 'Activate now' }: { subscriptionId: string; label?: string }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const activate = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/subscription/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId })
      });
      const j = await res.json().catch(() => null) as unknown;
      const obj = asRecord(j);
      if (obj && obj.ok === true) {
        // signal other UI to refresh
        window.dispatchEvent(new CustomEvent('subscription:updated'));
      } else {
        const errMsg = obj && typeof obj.error === 'string' ? obj.error : 'Activation failed';
        setError(errMsg);
      }
    } catch (e: unknown) {
      const err = toError(e);
      setError(err.message || 'Activation error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={activate}
        disabled={loading}
        className="text-xs bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 text-white px-3 py-1 rounded"
      >
        {loading ? 'Activating…' : label}
      </button>
      {error && <div className="text-xs text-rose-400">{error}</div>}
    </div>
  );
}
