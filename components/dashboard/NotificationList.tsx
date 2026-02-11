'use client';

import { useState, useEffect } from 'react';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

interface NotificationListProps {
  notifications: Notification[];
}

export function NotificationList({ notifications }: NotificationListProps) {
  const [items, setItems] = useState(notifications);
  const settings = useFormatSettings();

  const markAsRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH'
      });

      if (response.ok) {
        setItems(prev => prev.map(item => 
          item.id === id ? { ...item, read: true } : item
        ));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST'
      });

      if (response.ok) {
        setItems(prev => prev.map(item => ({ ...item, read: true })));
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const unreadCount = items.filter(n => !n.read).length;

  // Listen for global mark-all-read events and update UI in-place
  useEffect(() => {
    const handler = () => setItems(prev => prev.map(item => ({ ...item, read: true })));
    window.addEventListener('notifications:mark-all-read', handler as EventListener);
    return () => window.removeEventListener('notifications:mark-all-read', handler as EventListener);
  }, []);

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Mark all as read
          </button>
        </div>
      )}

      <div className="space-y-3">
        {items.map((notification) => (
          <div
            key={notification.id}
            className={`border rounded p-4 cursor-pointer transition-colors ${
              notification.read 
                ? 'border-neutral-700 bg-neutral-900/20' 
                : 'border-blue-700/50 bg-blue-900/10'
            }`}
            onClick={() => !notification.read && markAsRead(notification.id)}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  notification.type === 'BILLING' ? 'bg-green-400' :
                  notification.type === 'SUPPORT' ? 'bg-blue-400' :
                  notification.type === 'ACCOUNT' ? 'bg-purple-400' :
                  'bg-neutral-400'
                }`} />
                <span className={`font-medium ${
                  notification.read ? 'text-neutral-300' : 'text-white'
                }`}>
                  {notification.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!notification.read && (
                  <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                )}
                <span className="text-xs text-neutral-500">
                  {formatDate(notification.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                </span>
              </div>
            </div>
            <div className={`text-sm ${
              notification.read ? 'text-neutral-400' : 'text-neutral-300'
            }`}>
              {notification.message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
