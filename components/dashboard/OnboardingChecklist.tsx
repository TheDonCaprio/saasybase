'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

interface OnboardingChecklistProps {
  userId: string;
  progress: {
    hasSubscription: boolean;
    hasPayment: boolean;
    hasSettings: boolean;
    profileComplete: boolean;
  };
}

export function OnboardingChecklist({ userId, progress }: OnboardingChecklistProps) {
  const [currentStep, setCurrentStep] = useState(0);
  void userId;
  void setCurrentStep;
  void currentStep;

  const steps = [
    {
      id: 'profile',
      title: 'Complete Your Profile',
      description: 'Add your name and verify your email address',
      completed: progress.profileComplete,
      action: { label: 'Go to Profile', href: '/dashboard/profile' }
    },
    {
      id: 'subscription',
      title: 'Choose a Plan',
      description: 'Select a subscription plan that fits your needs',
      completed: progress.hasSubscription,
      action: { label: 'View Plans', href: '/dashboard/plan' }
    },
    {
      id: 'payment',
      title: 'Set Up Billing',
      description: 'Add a payment method and complete your first purchase',
      completed: progress.hasPayment,
      action: { label: 'Billing Settings', href: '/dashboard/billing' }
    },
    {
      id: 'settings',
      title: 'Customize Settings',
      description: 'Configure your preferences and notification settings',
      completed: progress.hasSettings,
      action: { label: 'Settings', href: '/dashboard/settings' }
    }
  ];

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={clsx(
            'rounded-[var(--theme-surface-radius)] border px-5 py-4 shadow-sm transition hover:shadow-md',
            step.completed
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10'
              : 'border-slate-200 bg-white hover:border-blue-300 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600'
          )}
        >
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div
                className={clsx(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  step.completed
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200'
                )}
              >
                {step.completed ? '✓' : index + 1}
              </div>
              <div>
                <h3
                  className={clsx(
                    'text-base font-semibold',
                    step.completed ? 'text-emerald-700 dark:text-emerald-200' : 'text-slate-900 dark:text-neutral-100'
                  )}
                >
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">{step.description}</p>
              </div>
            </div>

            {!step.completed && (
              <Link
                href={step.action.href}
                className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-blue-600 transition hover:border-blue-300 hover:bg-blue-50 dark:border-neutral-700 dark:text-blue-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
              >
                {step.action.label}
              </Link>
            )}
          </div>

          {step.completed && (
            <div className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
              <span className="text-sm">✓</span>
              Completed
            </div>
          )}
        </div>
      ))}

      <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-slate-50/70 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40">
        <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">Quick tips</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-neutral-400">
          <li>• Start with the 24-hour plan to test all features.</li>
          <li>• Use the support center if you need help getting started.</li>
          <li>• Check notifications for billing updates and new releases.</li>
        </ul>
      </div>
    </div>
  );
}
