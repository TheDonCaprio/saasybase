'use client';

import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronRight, faCopy, faCheck } from '@fortawesome/free-solid-svg-icons';
import {
  type AdminApiCatalog,
  type AdminApiEndpoint,
  type AdminApiAccessLevel
} from '../../lib/admin-api';
import {
  dashboardPanelClass,
  dashboardMutedPanelClass,
} from '../dashboard/dashboardSurfaces';

const METHOD_VARIANTS: Record<string, string> = {
  GET: 'bg-emerald-600 !text-white',
  POST: 'bg-blue-600 !text-white',
  PATCH: 'bg-amber-500 !text-white',
  PUT: 'bg-indigo-600 !text-white',
  DELETE: 'bg-rose-600 !text-white',
};

const ACCESS_LABELS: Record<AdminApiAccessLevel, string> = {
  admin: 'ADMIN',
  user: 'AUTH',
  public: 'PUBLIC',
  internal: 'INTERNAL',
};

const ACCESS_BADGE: Record<AdminApiAccessLevel, string> = {
  admin: 'bg-rose-500/15 text-rose-500 dark:text-rose-400',
  user: 'bg-sky-500/15 text-sky-500 dark:text-sky-400',
  public: 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400',
  internal: 'bg-violet-500/15 text-violet-500 dark:text-violet-400',
};

const METHOD_OPTIONS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

interface AdminApiDocsDashboardProps {
  catalog: AdminApiCatalog;
}

type MethodFilter = 'all' | (typeof METHOD_OPTIONS)[number];

type AccessFilter = 'all' | AdminApiAccessLevel;

function matchesFilters(endpoint: AdminApiEndpoint, query: string, method: MethodFilter, access: AccessFilter) {
  const haystack = `${endpoint.path} ${endpoint.summary} ${endpoint.description ?? ''}`.toLowerCase();
  const searchMatch = query ? haystack.includes(query.toLowerCase()) : true;
  const methodMatch = method === 'all' ? true : endpoint.method === method;
  const accessMatch = access === 'all' ? true : endpoint.access === access;
  return searchMatch && methodMatch && accessMatch;
}

function getRequestExample(endpoint: AdminApiEndpoint) {
  if (!endpoint.example) return null;
  return { title: 'Example request', data: endpoint.example };
}

function getResponseExample(endpoint: AdminApiEndpoint) {
  if (!endpoint.response) return null;
  return { title: 'Response', data: endpoint.response };
}

export default function AdminApiDocsDashboard({ catalog }: AdminApiDocsDashboardProps) {
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [access, setAccess] = useState<AccessFilter>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(catalog.categories.map(c => c.id)));

  const filteredCategories = useMemo(() => {
    return catalog.categories
      .map((category) => {
        const endpoints = category.endpoints.filter((endpoint) => matchesFilters(endpoint, query, method, access));
        return { ...category, endpoints };
      })
      .filter((category) => category.endpoints.length > 0);
  }, [catalog.categories, query, method, access]);

  const resultsCount = filteredCategories.reduce((total, category) => total + category.endpoints.length, 0);

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <section className={dashboardMutedPanelClass('space-y-4 sm:space-y-0 sm:flex sm:items-center sm:gap-3')}>
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            placeholder="Search endpoints..."
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          {query.trim().length > 0 ? (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as MethodFilter)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-36 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="all">All methods</option>
          {METHOD_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as AccessFilter)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="all">All access</option>
          <option value="admin">Admin only</option>
          <option value="user">Authenticated</option>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
        </select>
      </section>

      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">
        {resultsCount} {resultsCount === 1 ? 'endpoint' : 'endpoints'} across {filteredCategories.length}{' '}
        {filteredCategories.length === 1 ? 'category' : 'categories'}
      </p>

      {/* Category accordion sections */}
      <div className="space-y-4">
        {filteredCategories.map((category) => {
          const isOpen = expandedCategories.has(category.id);
          return (
            <section key={category.id} className={dashboardPanelClass('!p-0 overflow-hidden')}>
              {/* Category header — clickable toggle */}
              <button
                type="button"
                onClick={() => toggleCategory(category.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-neutral-800/40"
              >
                <FontAwesomeIcon
                  icon={isOpen ? faChevronDown : faChevronRight}
                  className="h-3 w-3 shrink-0 text-slate-400 dark:text-neutral-500"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-50">{category.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">{category.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {category.endpoints.length}
                </span>
              </button>

              {/* Endpoint list */}
              {isOpen ? (
                <div className="border-t border-slate-200/70 dark:border-neutral-700/70">
                  {category.endpoints.map((endpoint, idx) => (
                    <EndpointRow
                      key={`${endpoint.method}-${endpoint.path}`}
                      endpoint={endpoint}
                      isLast={idx === category.endpoints.length - 1}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expandable endpoint row                                           */
/* ------------------------------------------------------------------ */

function EndpointRow({ endpoint, isLast }: { endpoint: AdminApiEndpoint; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const methodStyle = METHOD_VARIANTS[endpoint.method] ?? 'bg-slate-600 !text-white';
  const accessBadge = ACCESS_BADGE[endpoint.access];
  const requestExample = getRequestExample(endpoint);
  const responseExample = getResponseExample(endpoint);

  const hasDetails = !!(endpoint.params || endpoint.body || requestExample || responseExample || (endpoint.notes && endpoint.notes.length > 0) || endpoint.description || endpoint.source);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(endpoint.path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  }, [endpoint.path]);

  return (
    <div className={clsx(!isLast && 'border-b border-slate-100 dark:border-neutral-800')}>
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => hasDetails && setOpen(prev => !prev)}
        className={clsx(
          'flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors sm:items-center',
          hasDetails && 'cursor-pointer hover:bg-slate-50/60 dark:hover:bg-neutral-800/30',
          !hasDetails && 'cursor-default',
        )}
      >
        {/* Method badge */}
        <span className={clsx('mt-0.5 shrink-0 rounded px-2 py-0.5 text-[11px] font-bold tracking-wider sm:mt-0', methodStyle)}>
          {endpoint.method}
        </span>

        {/* Path + summary */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="break-all text-sm font-semibold text-slate-800 dark:text-neutral-100">{endpoint.path}</code>
            <span className="text-sm text-slate-500 dark:text-neutral-400">{endpoint.summary}</span>
          </div>
        </div>

        {/* Access badge + chevron */}
        <div className="flex shrink-0 items-center gap-2">
          <span className={clsx('hidden rounded px-2 py-0.5 text-[10px] font-bold tracking-wider sm:inline-block', accessBadge)}>
            {ACCESS_LABELS[endpoint.access]}
          </span>
          {hasDetails ? (
            <FontAwesomeIcon
              icon={open ? faChevronDown : faChevronRight}
              className="h-2.5 w-2.5 text-slate-400 dark:text-neutral-500"
            />
          ) : null}
        </div>
      </button>

      {/* Mobile access badge — shown below on small screens */}
      <div className="flex items-center gap-2 px-5 pb-2 sm:hidden">
        <span className={clsx('rounded px-2 py-0.5 text-[10px] font-bold tracking-wider', accessBadge)}>
          {ACCESS_LABELS[endpoint.access]}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-slate-400 transition hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="h-2.5 w-2.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Expanded details */}
      {open ? (
        <div className="border-t border-dashed border-slate-200/70 bg-slate-50/50 px-5 py-4 dark:border-neutral-700/50 dark:bg-neutral-900/40">
          <div className="space-y-4">
            {/* Copy button (desktop) + description */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5 text-sm">
                {endpoint.description ? (
                  <p className="text-slate-600 dark:text-neutral-300">{endpoint.description}</p>
                ) : null}
                {endpoint.source ? (
                  <p className="text-xs text-slate-400 dark:text-neutral-500">
                    Source: <code className="font-mono">{endpoint.source}</code>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 sm:inline-flex dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="h-3 w-3" />
                {copied ? 'Copied!' : 'Copy path'}
              </button>
            </div>

            {/* Params */}
            {endpoint.params ? (
              <ParameterSection title="Query parameters" entries={endpoint.params} />
            ) : null}

            {/* Request body */}
            {endpoint.body ? (
              <ParameterSection title="Request body" entries={endpoint.body} />
            ) : null}

            {/* Example request */}
            {requestExample ? (
              <JsonBlock title={requestExample.title} data={requestExample.data} />
            ) : null}

            {/* Example response */}
            {responseExample ? (
              <JsonBlock title={responseExample.title} data={responseExample.data} />
            ) : null}

            {/* Notes */}
            {endpoint.notes && endpoint.notes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">Notes</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-neutral-400">
                  {endpoint.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Parameter / body section                                          */
/* ------------------------------------------------------------------ */

function ParameterSection({ title, entries }: { title: string; entries: Record<string, unknown> }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/80">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-neutral-800">
              <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-500 dark:text-neutral-400">Field</th>
              <th className="px-3 py-2 font-semibold text-slate-500 dark:text-neutral-400">Description / Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {Object.entries(entries).map(([key, value]) => (
              <tr key={key}>
                <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-slate-700 dark:text-neutral-200">
                  {key}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-neutral-300">
                  {typeof value === 'string' ? (
                    value
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  JSON code block (for example / response)                          */
/* ------------------------------------------------------------------ */

function JsonBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  const [blockCopied, setBlockCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleBlockCopy = useCallback(() => {
    navigator.clipboard?.writeText(json).then(() => {
      setBlockCopied(true);
      setTimeout(() => setBlockCopied(false), 1500);
    }).catch(() => undefined);
  }, [json]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">{title}</p>
        <button
          type="button"
          onClick={handleBlockCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-slate-400 transition hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          <FontAwesomeIcon icon={blockCopied ? faCheck : faCopy} className="h-2.5 w-2.5" />
          {blockCopied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs leading-relaxed text-emerald-300 dark:border-neutral-700 dark:bg-neutral-950">
        <code>{json}</code>
      </pre>
    </div>
  );
}
