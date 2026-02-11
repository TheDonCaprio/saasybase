import React from 'react';

export default function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-800 p-4 bg-neutral-900/40">
      <div className="text-neutral-400 text-[10px] uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
