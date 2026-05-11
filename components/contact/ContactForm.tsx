'use client';

import { useCallback, useState } from 'react';

const CONTACT_NAME_MAX_LENGTH = 120;
const CONTACT_COMPANY_MAX_LENGTH = 160;
const CONTACT_MESSAGE_MAX_LENGTH = 2000;

type FormState = {
  name: string;
  email: string;
  company: string;
  topic: string;
  message: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';

const TOPIC_OPTIONS = [
  'Pre-sale question',
  'Custom license inquiry',
  'Partnership opportunity',
  'Account or billing',
  'Bug report',
  'Feedback or feature request',
  'Something else'
] as const;

function buildInitialState(): FormState {
  return {
    name: '',
    email: '',
    company: '',
    topic: TOPIC_OPTIONS[0],
    message: ''
  };
}

export function ContactForm() {
  const [form, setForm] = useState<FormState>(() => buildInitialState());
  const [submission, setSubmission] = useState<SubmissionState>('idle');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setForm(buildInitialState());
    setFieldErrors({});
    setGeneralError(null);
  }, []);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submission === 'submitting') return;

    setSubmission('submitting');
    setGeneralError(null);
    setFieldErrors({});

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (response.ok) {
        setSubmission('success');
        resetForm();
        return;
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      const maybeError = payload && typeof payload === 'object' ? (payload as { error?: string; fieldErrors?: Record<string, string[]> }) : null;

      if (maybeError?.fieldErrors) {
        const flattened: FieldErrors = {};
        for (const [key, value] of Object.entries(maybeError.fieldErrors)) {
          if (Array.isArray(value) && value.length) {
            flattened[key as keyof FormState] = value[0];
          }
        }
        setFieldErrors(flattened);
      }

      setSubmission('error');
      setGeneralError(maybeError?.error || 'We could not submit your request. Please try again.');
    } catch (error) {
      console.error('Contact form submit failed', error);
      setSubmission('error');
      setGeneralError('Something went wrong. Please try again in a moment.');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Send us a message</h2>
      </div>

      {submission === 'success' ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100">
          Thanks for reaching out! Our team will follow up shortly.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">
                Full name
              </label>
              <input
                id="contact-name"
                type="text"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                maxLength={CONTACT_NAME_MAX_LENGTH}
                required
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 ${fieldErrors.name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Jane Doe"
                autoComplete="name"
              />
              <p className="mt-1 text-right text-[11px] text-slate-400 dark:text-neutral-500">{form.name.length}/{CONTACT_NAME_MAX_LENGTH}</p>
              {fieldErrors.name ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.name}</p> : null}
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                required
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 ${fieldErrors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="you@company.com"
                autoComplete="email"
              />
              {fieldErrors.email ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p> : null}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-company" className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">
                Company (optional)
              </label>
              <input
                id="contact-company"
                type="text"
                value={form.company}
                onChange={(event) => updateField('company', event.target.value)}
                maxLength={CONTACT_COMPANY_MAX_LENGTH}
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 ${fieldErrors.company ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Acme Corp"
                autoComplete="organization"
              />
              <p className="mt-1 text-right text-[11px] text-slate-400 dark:text-neutral-500">{form.company.length}/{CONTACT_COMPANY_MAX_LENGTH}</p>
              {fieldErrors.company ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.company}</p> : null}
            </div>
            <div>
              <label htmlFor="contact-topic" className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">
                Topic
              </label>
              <select
                id="contact-topic"
                value={form.topic}
                onChange={(event) => updateField('topic', event.target.value)}
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 ${fieldErrors.topic ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              >
                {TOPIC_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {fieldErrors.topic ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.topic}</p> : null}
            </div>
          </div>

          <div>
            <label htmlFor="contact-message" className="mb-2 block text-sm font-medium text-slate-700 dark:text-neutral-200">
              How can we help?
            </label>
            <textarea
              id="contact-message"
              value={form.message}
              onChange={(event) => updateField('message', event.target.value)}
              required
              maxLength={CONTACT_MESSAGE_MAX_LENGTH}
              rows={6}
              className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 ${fieldErrors.message ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              placeholder="Share a few details so we can respond with the right next steps."
            />
            <p className="mt-1 text-right text-[11px] text-slate-400 dark:text-neutral-500">{form.message.length}/{CONTACT_MESSAGE_MAX_LENGTH}</p>
            {fieldErrors.message ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.message}</p> : null}
          </div>

          {generalError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-100">
              {generalError}
            </div>
          ) : null}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-slate-400 dark:text-neutral-500">
              For urgent production issues, include your workspace URL.
            </p>
            <button
              type="submit"
              disabled={submission === 'submitting'}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-slate-50 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-neutral-200"
            >
              {submission === 'submitting' ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  </svg>
                  Sending
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 8-16 8 4-8z" />
                  </svg>
                  Send message
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
