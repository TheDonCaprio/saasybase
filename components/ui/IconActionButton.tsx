"use client";

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

type ColorKey = 'indigo' | 'amber' | 'emerald' | 'rose';

const bgClasses: Record<ColorKey, string> = {
  indigo:
    'bg-indigo-600 hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-100 dark:hover:bg-neutral-900',
  amber:
    'bg-amber-500 hover:bg-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
  emerald:
    'bg-blue-500 hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
  rose:
    'bg-rose-500 hover:bg-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-rose-500/40 dark:text-rose-300 dark:bg-transparent dark:hover:bg-rose-500/10',
};

export default function IconActionButton({
  onClick,
  title,
  ariaLabel,
  icon,
  variant = 'default',
  active = false,
  activeColor = 'amber',
  inactiveColor = 'emerald',
  color = 'indigo',
  disabled = false,
}: {
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  icon: IconDefinition;
  variant?: 'default' | 'conditional';
  active?: boolean;
  activeColor?: ColorKey;
  inactiveColor?: ColorKey;
  color?: ColorKey; // used when variant === 'default'
  disabled?: boolean;
}) {
  const chosenColor: ColorKey = variant === 'conditional' ? (active ? activeColor : inactiveColor) : color;
  const disabledClasses =
    'inline-flex items-center justify-center rounded-full w-9 h-9 text-slate-500 bg-slate-100 shadow-sm transition opacity-70 cursor-not-allowed dark:bg-neutral-800/50 dark:text-neutral-400';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      className={disabled ? disabledClasses : `inline-flex items-center justify-center rounded-full w-9 h-9 text-actual-white shadow-sm transition ${bgClasses[chosenColor]}`}
    >
      <FontAwesomeIcon icon={icon} className="w-3.5 h-3.5" />
    </button>
  );
}
