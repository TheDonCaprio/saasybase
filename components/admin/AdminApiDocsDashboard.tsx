'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  type AdminApiCatalog,
  type AdminApiEndpoint,
  type AdminApiAccessLevel
} from '../../lib/admin-api';
import {
  dashboardPanelClass,
  dashboardMutedPanelClass,
  dashboardPillClass
} from '../dashboard/dashboardSurfaces';

const METHOD_VARIANTS: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30',
  POST: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  PATCH: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  PUT: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30',
  DELETE: 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
};

const ACCESS_LABELS: Record<AdminApiAccessLevel, string> = {
  admin: 'Admin only',
  user: 'Authenticated user',
  public: 'Public',
  internal: 'Internal'
};

const ACCESS_BADGE: Record<AdminApiAccessLevel, string> = {
  admin: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
  user: 'bg-sky-500/10 text-sky-400 border border-sky-500/30',
  public: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  internal: 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
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

export default function AdminApiDocsDashboard({ catalog }: AdminApiDocsDashboardProps) {
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [access, setAccess] = useState<AccessFilter>('all');

  const filteredCategories = useMemo(() => {
    return catalog.categories
      .map((category) => {
        const endpoints = category.endpoints.filter((endpoint) => matchesFilters(endpoint, query, method, access));
        return { ...category, endpoints };
      })
      .filter((category) => category.endpoints.length > 0);
  }, [catalog.categories, query, method, access]);

  const resultsCount = filteredCategories.reduce((total, category) => total + category.endpoints.length, 0);

  return (
    <div className="space-y-6">
      <section className={dashboardMutedPanelClass('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between')}
      >
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">Filter catalog</p>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            Narrow endpoints by method, access level, or keywords. Copy paths directly for API clients.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <div className="relative sm:w-64">
            <input
              type="search"
              value={query}
              placeholder="Search paths or descriptions"
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="all">All access levels</option>
            <option value="admin">Admin only</option>
            <option value="user">Authenticated user</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
          </select>
        </div>
      </section>

      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">
        Showing {resultsCount} {resultsCount === 1 ? 'endpoint' : 'endpoints'} across {filteredCategories.length}{' '}
        {filteredCategories.length === 1 ? 'category' : 'categories'}
      </p>

      <div className="space-y-6">
        {filteredCategories.map((category) => (
          <article key={category.id} className={dashboardPanelClass('space-y-5')}>
            <header className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">{category.title}</h3>
              <p className="text-sm text-slate-600 dark:text-neutral-300">{category.description}</p>
            </header>
            <div className="space-y-5">
              {category.endpoints.map((endpoint) => (
                <EndpointCard key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: AdminApiEndpoint }) {
  const overrideMethodClass = METHOD_VARIANTS[endpoint.method] ?? 'bg-slate-500/10 text-slate-300 border border-slate-500/20';
  const accessBadge = ACCESS_BADGE[endpoint.access];

  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className={clsx('rounded-md px-2 py-1 text-xs font-semibold tracking-wide', overrideMethodClass)}>
            {endpoint.method}
          </span>
          <code className="font-mono text-sm text-indigo-500 dark:text-indigo-300">{endpoint.path}</code>
          <button
            type="button"
            className={clsx(
              dashboardPillClass,
              'inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            )}
            onClick={() => navigator.clipboard?.writeText(endpoint.path).catch(() => undefined)}
          >
            Copy
          </button>
        </div>
  <span className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide', accessBadge)}>
          {ACCESS_LABELS[endpoint.access]}
        </span>
      </div>

      <div className="space-y-2 text-sm text-slate-600 dark:text-neutral-300">
        <p className="font-medium text-slate-900 dark:text-neutral-100">{endpoint.summary}</p>
        {endpoint.description ? <p>{endpoint.description}</p> : null}
        {endpoint.source ? (
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            <span className="font-semibold">Source:</span> <code className="font-mono">{endpoint.source}</code>
          </p>
        ) : null}
      </div>

      {endpoint.params ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Query parameters</p>
          <ParameterList entries={endpoint.params} />
        </div>
      ) : null}

      {endpoint.body ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Body schema</p>
          <ParameterList entries={endpoint.body} />
        </div>
      ) : null}

      {endpoint.notes && endpoint.notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-neutral-400">
          {endpoint.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ParameterList({ entries }: { entries: Record<string, unknown> }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-300">
      {Object.entries(entries).map(([key, value]) => (
        <div key={key} className="grid grid-cols-[12.5rem_minmax(0,1fr)] items-start gap-2">
          <span className="break-words whitespace-normal text-slate-500 dark:text-neutral-400">{key}</span>
          <span className="min-w-0 whitespace-pre-wrap break-words text-left">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}
