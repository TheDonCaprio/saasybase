'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { ThemeLink } from '@/lib/settings';

export function HeaderMobileMenu({ links }: { links: ThemeLink[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeMenu, isOpen]);

  return (
    <div className="lg:hidden relative z-[50000]" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 relative z-[50000]"
        aria-label="Menu"
      >
        <FontAwesomeIcon icon={isOpen ? faXmark : faBars} className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div
            aria-hidden
            style={{ top: '4.1rem' }}
            className="fixed right-[1.65rem] z-[1000000] h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          />
          <div style={{ top: '4.1rem' }} className="fixed right-4 w-56 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden z-[999999]">
          <nav className="flex flex-col py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        </>
      )}
    </div>
  );
}
