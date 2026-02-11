'use client';

import { useState } from 'react';
import { UserActions } from './UserActions';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { getCanonicalActiveSubscription } from '../../lib/subscriptions';

interface User {
  id: string;
  email: string | null;
  role: string;
  createdAt: Date;
  subscriptions: Array<{
    plan: { name: string };
  }>;
  _count: { payments: number };
}

interface UserManagementProps {
  users: User[];
}

export function UserManagement({ users: initialUsers }: UserManagementProps) {
  const [users] = useState(initialUsers);
  const [filter, setFilter] = useState('');
  const settings = useFormatSettings();

  const filteredUsers = users.filter(u => 
    !filter || 
    u.email?.toLowerCase().includes(filter.toLowerCase()) ||
    u.role.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Filter users..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm flex-1"
        />
        <div className="text-sm text-neutral-400 py-2">
          {filteredUsers.length} of {users.length} users
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-neutral-800 rounded overflow-hidden">
          <thead className="bg-neutral-900 text-neutral-400 text-xs">
            <tr>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Payments</th>
              <th className="p-3 text-left">Created</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-t border-neutral-800 hover:bg-neutral-900/60">
                <td className="p-3">
                  <div className="space-y-1">
                    <div className="font-medium">{user.email || 'No email'}</div>
                    <div className="font-mono text-xs text-neutral-500">{user.id.slice(0, 8)}</div>
                  </div>
                </td>
                <td className="p-3">
                  <div className="space-y-1">
                    <span className={`text-xs px-2 py-1 rounded ${
                      user.role === 'ADMIN' 
                        ? 'bg-purple-900/20 border border-purple-700 text-purple-400'
                        : 'bg-neutral-800 border border-neutral-700 text-neutral-400'
                    }`}>
                      {user.role}
                    </span>
                    {(() => {
                      const canonical = getCanonicalActiveSubscription(user.subscriptions as unknown);
                      return canonical ? (
                        <div className="text-xs text-emerald-400">{canonical.plan?.name ?? 'Unknown plan'}</div>
                      ) : null;
                    })()}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <span className="text-neutral-400">{user._count.payments}</span>
                </td>
                <td className="p-3 text-xs text-neutral-500">
                  {formatDate(user.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                </td>
                <td className="p-3">
                  <UserActions user={user} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
