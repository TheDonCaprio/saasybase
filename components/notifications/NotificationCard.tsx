"use client";

import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileInvoiceDollar,
  faLifeRing,
  faUser,
  faBullhorn,
  faCircle,
  faCheckCircle
} from '@fortawesome/free-solid-svg-icons';

interface NotificationCardProps {
  id: string;
  title: string;
  message?: string;
  type?: string;
  read?: boolean;
  createdAt?: string | Date;
  userEmail?: string;
  onMarkAsRead?: (id: string) => void;
  showUser?: boolean;
  showMarkAsRead?: boolean;
  isAdminView?: boolean;
  url?: string | null;
}

const getTypeConfig = (type?: string) => {
  switch (type) {
    case 'BILLING':
      return {
        icon: faFileInvoiceDollar,
        label: 'Billing',
        bgColor: 'bg-orange-50 dark:bg-orange-500/5',
        borderColor: 'border-orange-200 dark:border-orange-500/20',
        iconColor: 'text-orange-600 dark:text-orange-400',
        badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200'
      };
    case 'SUPPORT':
      return {
        icon: faLifeRing,
        label: 'Support',
        bgColor: 'bg-blue-50 dark:bg-blue-500/5',
        borderColor: 'border-blue-200 dark:border-blue-500/20',
        iconColor: 'text-blue-600 dark:text-blue-400',
        badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200'
      };
    case 'ACCOUNT':
      return {
        icon: faUser,
        label: 'Account',
        bgColor: 'bg-purple-50 dark:bg-purple-500/5',
        borderColor: 'border-purple-200 dark:border-purple-500/20',
        iconColor: 'text-purple-600 dark:text-purple-400',
        badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-200'
      };
    case 'GENERAL':
    default:
      return {
        icon: faBullhorn,
        label: 'General',
        bgColor: 'bg-green-50 dark:bg-green-500/5',
        borderColor: 'border-green-200 dark:border-green-500/20',
        iconColor: 'text-green-600 dark:text-green-400',
        badgeColor: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200'
      };
  }
};

export function NotificationCard({
  id,
  title,
  message,
  type,
  read = false,
  createdAt,
  userEmail,
  onMarkAsRead,
  showUser = false,
  showMarkAsRead = true,
  isAdminView = false
  , url
}: NotificationCardProps) {
  const settings = useFormatSettings();
  const typeConfig = getTypeConfig(type);

  const isUnread = !read;

  const handleLinkClick = () => {
    // If unread and an onMarkAsRead handler exists, mark it read (don't block navigation)
    try {
      if (isUnread && onMarkAsRead) {
        // fire-and-forget; navigation may cancel the request but best-effort
        onMarkAsRead(id);
      }
    } catch (err) {
      void err;
    }
  };

  return (
    <div className={`
      relative rounded-xl border p-4 transition-all duration-200
      ${isUnread
        ? `${typeConfig.bgColor} ${typeConfig.borderColor} shadow-sm hover:shadow-md`
        : 'bg-white/50 dark:bg-neutral-900/30 border-gray-200 dark:border-neutral-700/50 hover:bg-white/80 dark:hover:bg-neutral-900/50'
      }
    `}>

      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`
          flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg
          ${isUnread ? typeConfig.badgeColor : 'bg-gray-100 dark:bg-neutral-800'}
        `}>
          <FontAwesomeIcon
            icon={typeConfig.icon}
            className={`w-4 h-4 ${isUnread ? '' : 'text-gray-500 dark:text-neutral-400'}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`
                inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                ${typeConfig.badgeColor}
              `}>
                {typeConfig.label}
              </span>

              {showUser && userEmail && (
                <span className="text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-2 py-0.5 rounded-full">
                  {userEmail}
                </span>
              )}

              <span className="text-xs text-gray-500 dark:text-neutral-400">
                {formatDate(createdAt, { mode: settings.mode, timezone: settings.timezone })}
              </span>
            </div>

            {/* Read status & action */}
            {!isAdminView && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isUnread ? (
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={faCircle}
                      className={`w-2 h-2 ${typeConfig.iconColor}`}
                    />
                    {showMarkAsRead && onMarkAsRead && (
                      <button
                        onClick={() => onMarkAsRead(id)}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium transition-colors hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3" />
                    <span className="font-medium">Read</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className={`
            mb-1 text-sm font-semibold
            ${isUnread
              ? 'text-gray-900 dark:text-neutral-50'
              : 'text-gray-700 dark:text-neutral-200'
            }
          `}>
            {url ? (
              <a href={url} onClick={handleLinkClick} className="hover:underline">
                {title || 'Untitled notification'}
              </a>
            ) : (
              title || 'Untitled notification'
            )}
          </h3>

          {/* Message */}
          {message && (
            <p className={`
              text-sm leading-snug
              ${isUnread
                ? 'text-gray-700 dark:text-neutral-200'
                : 'text-gray-600 dark:text-neutral-300'
              }
            `}>
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}