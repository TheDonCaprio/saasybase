'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuthUser, AuthOrganizationSwitcher, AuthSignOutButton } from '@/lib/auth-provider/client';
import { getOrganizationSwitcherAppearance } from '@/lib/auth-provider/client/clerk-appearance';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronUp, faSignOutAlt, faUser, faCog } from '@fortawesome/free-solid-svg-icons';
import Link from 'next/link';

export function SidebarFooter() {
  const { user, isLoaded } = useAuthUser();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isLoaded || !user) return null;

  return (
    <div className="w-full space-y-3 pb-2 pt-4 border-t border-neutral-200 dark:border-neutral-800/60" ref={menuRef}>
      {/* Workspace Switcher */}
      <div className="relative z-[60] px-2">
         <AuthOrganizationSwitcher 
           appearance={getOrganizationSwitcherAppearance({ variant: 'sidebar' })}
         />
      </div>

      {/* User Profile / Account Switcher Trigger */}
      <div className={`relative px-2 ${isMenuOpen ? 'z-[80]' : 'z-[55]'}`}>
        {isMenuOpen && (
          <div className="absolute bottom-full left-0 z-[85] mb-2 w-full min-w-[200px] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/30 dark:ring-white/10">
            <Link 
              href="/dashboard/profile"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5 opacity-60" />
              <span>Profile Settings</span>
            </Link>
            <Link 
              href="/dashboard/settings"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faCog} className="h-3.5 w-3.5 opacity-60" />
              <span>General Settings</span>
            </Link>
            <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
            <AuthSignOutButton>
              <button 
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faSignOutAlt} className="h-3.5 w-3.5 opacity-80" />
                <span>Sign Out</span>
              </button>
            </AuthSignOutButton>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 transition-all duration-200 ${
            isMenuOpen 
              ? 'bg-neutral-100 dark:bg-neutral-800 ring-1 ring-neutral-200 dark:ring-neutral-700' 
              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-500/20 overflow-hidden shadow-sm">
            {user.imageUrl ? (
              <Image src={user.imageUrl} alt={user.fullName || 'User'} fill sizes="32px" className="object-cover" />
            ) : (
              <span className="text-xs font-bold text-violet-600 dark:text-violet-300">
                {user.fullName?.charAt(0) || user.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col items-start truncate leading-tight">
            <span className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 truncate w-full text-left">
              {user.fullName || (user.primaryEmailAddress?.emailAddress.split('@')[0])}
            </span>
            <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 truncate w-full text-left">
              {user.primaryEmailAddress?.emailAddress}
            </span>
          </div>
          <FontAwesomeIcon 
            icon={faChevronUp} 
            className={`h-2.5 w-2.5 text-neutral-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-0' : 'rotate-180 opacity-50'}`} 
          />
        </button>
      </div>
    </div>
  );
}
