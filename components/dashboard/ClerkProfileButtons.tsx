"use client";

import React, { useEffect, useRef } from 'react';
import { ClerkProfileModal } from './ClerkProfileModal';

export default function ClerkProfileButtons() {
  const editLabelRef = useRef<HTMLSpanElement | null>(null);
  const editIconRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    // No JS color overrides — rely on .text-actual-white utility to force white text and SVG color
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <ClerkProfileModal
        trigger={
          <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white text-actual-white shadow-lg shadow-blue-600/20 transition-all hover:from-blue-700 hover:to-emerald-600 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:shadow-blue-500/20 dark:hover:shadow-blue-500/30 dark:focus:ring-offset-neutral-900">
            <svg ref={editIconRef} className="h-4 w-4 text-actual-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span ref={editLabelRef} className="text-actual-white">Edit name & email</span>
          </button>
        }
        mode="profile"
      />

      <ClerkProfileModal
        trigger={
          <button className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:focus:ring-offset-neutral-900">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Change password
          </button>
        }
        mode="security"
      />
    </div>
  );
}
