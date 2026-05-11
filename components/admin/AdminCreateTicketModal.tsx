'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '../ui/Toast';
import {
  DEFAULT_SUPPORT_TICKET_CATEGORY,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_CATEGORY_LABELS,
  type SupportTicketCategory,
} from '../../lib/support-ticket-categories';
import {
  SUPPORT_TICKET_MESSAGE_MAX_LENGTH,
  SUPPORT_TICKET_SUBJECT_MAX_LENGTH,
} from '../../lib/support-ticket-input';

interface UserSuggestion {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string;
  lastName?: string;
}

interface AdminCreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const SUGGESTION_MIN_LENGTH = 2;

export function AdminCreateTicketModal({ open, onClose, onCreated }: AdminCreateTicketModalProps) {
  const [query, setQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>(DEFAULT_SUPPORT_TICKET_CATEGORY);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'admin-create-ticket-layer';
    document.body.appendChild(el);
    containerRef.current = el;
    setPortalReady(true);
    return () => {
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
      containerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) && inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedUser(null);
      setSuggestions([]);
      setShowSuggestions(false);
      setSubject('');
      setMessage('');
      setCategory(DEFAULT_SUPPORT_TICKET_CATEGORY);
      setIsSubmitting(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (debouncedQuery.length < SUGGESTION_MIN_LENGTH) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    // If we've already selected a user and the debounced query matches
    // that user's email, avoid re-fetching and re-opening the suggestions
    // (this prevents the list from briefly reappearing after selection).
    if (selectedUser && debouncedQuery === (selectedUser.email ?? '')) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();

    const fetchSuggestions = async () => {
      try {
        const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(debouncedQuery)}`, {
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = await response.json();
        setSuggestions(payload.users ?? []);
        setShowSuggestions(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to load user suggestions', error);
      }
    };

    fetchSuggestions();

    return () => controller.abort();
  }, [debouncedQuery, selectedUser]);


  const formattedSelectedUser = useMemo(() => {
    if (!selectedUser) return null;
    const parts = [];
    if (selectedUser.firstName) parts.push(selectedUser.firstName);
    if (selectedUser.lastName) parts.push(selectedUser.lastName);
    return `${parts.join(' ') || selectedUser.name || ''}`.trim();
  }, [selectedUser]);

  const handleSelect = (user: UserSuggestion) => {
    setSelectedUser(user);
    setQuery(user.email);
    setShowSuggestions(false);
  };

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) {
      showToast('Select a user before submitting.', 'error');
      return;
    }

    if (!subject.trim() || !message.trim()) {
      showToast('Both subject and message are required.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          subject: subject.trim(),
          message: message.trim(),
          category,
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const apiError = payload && typeof payload === 'object' ? (payload as { error?: string; issues?: string[] }) : null;
        const issueMessage = apiError?.issues?.length ? apiError.issues.join(' · ') : null;
        const messageToShow = issueMessage || apiError?.error || 'Failed to create ticket';
        showToast(messageToShow, 'error');
        return;
      }

      showToast('Support ticket created for user.', 'success');
      onCreated();
      onClose();
    } catch (error) {
      console.error('Failed to create admin ticket', error);
      showToast('Something went wrong while creating the ticket.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [category, message, onClose, onCreated, selectedUser, subject]);

  if (!portalReady || !containerRef.current) return null;
  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon icon={faPlus} className="text-violet-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Create ticket for user</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">User</label>
            <div className="relative mt-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedUser(null);
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Search by name or email"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-11 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
              />
              {query.trim().length > 0 ? (
                <div className="absolute inset-y-0 right-0 z-10 flex items-center pr-3">
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('');
                      setSelectedUser(null);
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              {showSuggestions && suggestions.length > 0 && (
                <div ref={suggestionsRef} className="absolute inset-x-0 top-full mt-2 rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900 z-10">
                  {suggestions.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelect(user)}
                      className="w-full px-4 py-3 text-left text-sm text-slate-900 hover:bg-violet-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <div className="font-semibold">{user.email}</div>
                      {(user.firstName || user.lastName || user.name) && (
                        <div className="text-xs text-slate-500 dark:text-neutral-400">
                          {(user.firstName || user.lastName) ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : user.name}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedUser && (
              <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                Ticket will be created for {formattedSelectedUser || 'the selected user'} <span className="font-medium text-slate-700 dark:text-neutral-100">({selectedUser.email})</span>.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Subject</label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
              placeholder="Concise ticket subject"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            />
            <div className="mt-1 text-right text-[11px] text-slate-500 dark:text-neutral-400">
              {subject.length}/{SUPPORT_TICKET_SUBJECT_MAX_LENGTH}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Category</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            >
              {SUPPORT_TICKET_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {SUPPORT_TICKET_CATEGORY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Message</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={SUPPORT_TICKET_MESSAGE_MAX_LENGTH}
              rows={4}
              placeholder="Describe the issue or request for the user"
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            />
            <div className="mt-1 text-right text-[11px] text-slate-500 dark:text-neutral-400">
              {message.length}/{SUPPORT_TICKET_MESSAGE_MAX_LENGTH}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-500 hover:text-slate-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-violet-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Creating...' : 'Create ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, containerRef.current);
}
