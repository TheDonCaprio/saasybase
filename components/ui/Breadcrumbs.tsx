import Link from 'next/link';
import React from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm leading-snug">
      <ol className="list-none p-0 inline">
        {items.map((it, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <React.Fragment key={idx}>
              <li className="inline">
                {it.href && !isLast ? (
                  <Link 
                    href={it.href} 
                    className="hover:text-violet-600 dark:hover:text-violet-400 text-slate-600 dark:text-slate-300 transition-colors font-medium whitespace-nowrap"
                  >
                    {it.label}
                  </Link>
                ) : (
                  <span className={isLast ? 'text-slate-400 dark:text-slate-500 font-normal break-words' : 'text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap'}>
                    {it.label}
                  </span>
                )}
              </li>

              {!isLast && (
                <span className="inline-block mx-1.5 align-text-bottom" aria-hidden="true" style={{ verticalAlign: 'middle' }}>
                  <svg className="w-4 h-4 text-slate-400 dark:text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
