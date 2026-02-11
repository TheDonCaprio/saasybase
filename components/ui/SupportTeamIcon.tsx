import React from 'react';

interface SupportTeamIconProps {
  className?: string;
}

export function SupportTeamIcon({ className = 'w-4 h-4' }: SupportTeamIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 2a9 9 0 0 0-9 9v2a3 3 0 0 0 3 3h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1H6v-1a6 6 0 0 1 12 0v1h-1a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a3 3 0 0 0 3-3v-2a9 9 0 0 0-9-9Z" />
      <path d="M9 15v1a3 3 0 0 0 3 3h1.5a.75.75 0 1 1 0 1.5H12a4.5 4.5 0 0 1-4.5-4.5V15H9Z" />
    </svg>
  );
}
