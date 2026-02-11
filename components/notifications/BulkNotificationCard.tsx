"use client";

import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFileInvoiceDollar, 
  faLifeRing, 
  faUser, 
  faBullhorn,
  
} from '@fortawesome/free-solid-svg-icons';

interface BulkNotificationCardProps {
  title: string;
  message?: string;
  type?: string;
  recipientCount: number;
  createdAt?: string | Date;
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

export function BulkNotificationCard({
  title,
  message,
  type,
  recipientCount,
  createdAt
}: BulkNotificationCardProps) {
  const settings = useFormatSettings();
  const typeConfig = getTypeConfig(type);
  const numberFormatter = new Intl.NumberFormat('en-US');
  
  return (
    <div className={`
      rounded-xl border p-5 transition-all duration-200
      ${typeConfig.bgColor} ${typeConfig.borderColor} shadow-sm hover:shadow-md
    `}>
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
          ${typeConfig.badgeColor}
        `}>
          <FontAwesomeIcon 
            icon={typeConfig.icon} 
            className="w-4 h-4"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`
                inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                ${typeConfig.badgeColor}
              `}>
                {typeConfig.label}
              </span>
              
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-2 py-0.5 rounded-full">
                Sent to {numberFormatter.format(recipientCount)} users
              </span>
              
              <span className="text-xs text-gray-500 dark:text-neutral-400">
                {formatDate(createdAt, { mode: settings.mode, timezone: settings.timezone })}
              </span>
            </div>

            {/* delivery/read tag intentionally removed for bulk/admin listing */}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold mb-1 text-gray-900 dark:text-neutral-50">
            {title || 'Untitled notification'}
          </h3>

          {/* Message */}
          {message && (
            <p className="text-sm leading-relaxed text-gray-700 dark:text-neutral-200">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
