'use client';

import { useState, useEffect } from 'react';

interface AnnouncementBannerProps {
  message: string;
}

export function AnnouncementBanner({ message }: AnnouncementBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if this announcement was already dismissed
    const dismissedKey = `announcement-dismissed-${encodeURIComponent(message.slice(0, 50))}`;
    const dismissed = localStorage.getItem(dismissedKey);
    if (dismissed) {
      setIsDismissed(true);
      setIsVisible(false);
    }
  }, [message]);

  const handleDismiss = () => {
    const dismissedKey = `announcement-dismissed-${encodeURIComponent(message.slice(0, 50))}`;
    localStorage.setItem(dismissedKey, 'true');
    setIsVisible(false);
    setIsDismissed(true);
  };

  if (!message.trim() || isDismissed) {
    return null;
  }

  return (
    <div
      className={`transition-all duration-500 ease-in-out ${
        isVisible ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
      }`}
    >
      <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            </div>
            <div className="text-sm text-blue-100">
              {message}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 ml-4 p-1 hover:bg-blue-600/20 rounded transition-colors"
            aria-label="Dismiss announcement"
          >
            <span className="text-blue-300 hover:text-blue-100 text-lg leading-none">×</span>
          </button>
        </div>
      </div>
    </div>
  );
}
