'use client';

import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faBell } from '@fortawesome/free-solid-svg-icons';
import { createPortal } from 'react-dom';

interface UserSuggestion {
  email: string;
  firstName?: string;
  lastName?: string;
}

export function CreateNotificationForm() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('GENERAL');
  const [target, setTarget] = useState('all');
  const [targetEmail, setTargetEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'create-notification-modal-layer';
    document.body.appendChild(el);
    containerRef.current = el;
    setReady(true);
    return () => {
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
      containerRef.current = null;
    };
  }, []);

  const handleEmailChange = async (value: string) => {
    setTargetEmail(value);
    
    if (value.length > 2) {
      try {
        const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(value)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.users || []);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Error fetching user suggestions:', error);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectUser = (user: UserSuggestion) => {
    setTargetEmail(user.email);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const body = {
        title,
        message,
        type,
        target,
        targetEmail: target === 'user' ? targetEmail : undefined
      };

      const response = await fetch('/api/admin/notifications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to send notification');

      setTitle('');
      setMessage('');
      setType('GENERAL');
      setTarget('all');
      setTargetEmail('');
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setIsOpen(false);
      }, 2000);
    } catch (error) {
      console.error('Error sending notification:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const form = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-neutral-200">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-neutral-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
            placeholder="Notification title"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-neutral-200">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
          >
            <option value="GENERAL">General</option>
            <option value="BILLING">Billing</option>
            <option value="SUPPORT">Support</option>
            <option value="ACCOUNT">Account</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-neutral-200">Target</label>
        <div className="flex gap-4 mb-3">
          <label className="flex items-center">
            <input
              type="radio"
              name="target"
              value="all"
              checked={target === 'all'}
              onChange={(e) => setTarget(e.target.value)}
              className="mr-2"
            />
            <span className="text-gray-700 dark:text-neutral-300">All Users</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="target"
              value="user"
              checked={target === 'user'}
              onChange={(e) => setTarget(e.target.value)}
              className="mr-2"
            />
            <span className="text-gray-700 dark:text-neutral-300">Specific User</span>
          </label>
        </div>
        {target === 'user' && (
          <div className="relative">
            <input
              type="text"
              value={targetEmail}
              onChange={(e) => handleEmailChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              required={target === 'user'}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-neutral-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
              placeholder="Start typing email (e.g., user@)"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div 
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded shadow-lg z-10 max-h-48 overflow-y-auto"
              >
                {suggestions.map((user) => (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => selectUser(user)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-900 dark:text-neutral-200 text-sm border-b border-gray-200 dark:border-neutral-800 last:border-b-0"
                  >
                    <div className="font-medium">{user.email}</div>
                    {(user.firstName || user.lastName) && (
                      <div className="text-xs text-gray-600 dark:text-neutral-400">
                        {user.firstName} {user.lastName}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-neutral-200">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={4}
          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-neutral-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
          placeholder="Notification message..."
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-neutral-700 text-white px-6 py-2 rounded transition-colors font-medium"
        >
          {isSubmitting ? 'Sending...' : 'Send Notification'}
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="bg-gray-300 dark:bg-neutral-700 hover:bg-gray-400 dark:hover:bg-neutral-600 text-gray-900 dark:text-white px-6 py-2 rounded transition-colors font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-neutral-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faBell} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">Send Notification</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          {success ? (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded text-green-800 dark:text-green-400 text-center font-medium">
              Notification sent successfully!
            </div>
          ) : (
            form
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors font-medium flex items-center gap-2"
      >
        <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
        Send Notification
      </button>

      {ready && containerRef.current && isOpen && createPortal(modalContent, containerRef.current)}
    </>
  );
}
