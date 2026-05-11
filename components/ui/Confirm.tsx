"use client";

import { ReactNode } from 'react';

interface ConfirmProps {
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function Confirm({ title = 'Confirm', description, confirmText = 'Confirm', cancelText = 'Cancel', open, onConfirm, onCancel }: ConfirmProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="bg-neutral-900 border border-neutral-800 rounded p-6 z-10 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        {description && <div className="text-sm text-neutral-400 mb-4">{description}</div>}
        <div className="flex justify-end gap-3">
          <button className="px-3 py-1 text-sm border border-neutral-700 rounded" onClick={onCancel}>{cancelText}</button>
          <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
