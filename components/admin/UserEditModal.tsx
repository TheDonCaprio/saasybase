'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { showToast } from '../ui/Toast';
import { getCanonicalActiveSubscription, SubRecord } from '../../lib/subscriptions';

interface ClerkData {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status: string };
  }>;
  phoneNumbers: Array<{
    id: string;
    phoneNumber: string;
    verification: { status: string };
  }>;
  lastSignInAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface User {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
  clerkData: ClerkData | null;
  tokenBalance: number;
  subscriptions: SubRecord[];
}

interface PlanOption {
  id: string;
  name: string;
  durationHours: number;
  tokenLimit: number | null;
}

interface UserEditModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  // Accept a partial User so callers that expect Partial<User> remain compatible
  onUserUpdate: (updatedUser: Partial<User>) => void;
  canManageRoles: boolean;
}

export function UserEditModal({ user, isOpen, onClose, onUserUpdate, canManageRoles }: UserEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'USER'
  });
  const [tokenAdjustment, setTokenAdjustment] = useState('');
  const [tokenReason, setTokenReason] = useState('');
  const [tokenUpdating, setTokenUpdating] = useState(false);
  const [currentTokenBalance, setCurrentTokenBalance] = useState<number>(typeof user.tokenBalance === 'number' ? user.tokenBalance : Number(user.tokenBalance ?? 0));
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [subscriptions, setSubscriptions] = useState<SubRecord[]>(Array.isArray(user.subscriptions) ? user.subscriptions : []);

  const currentPlan = useMemo(() => getCanonicalActiveSubscription(subscriptions), [subscriptions]);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) ?? null, [plans, selectedPlanId]);

  useEffect(() => {
    if (isOpen && user) {
      setFormData({
        firstName: user.clerkData?.firstName || '',
        lastName: user.clerkData?.lastName || '',
        email: user.email || '',
        role: user.role
      });
      setCurrentTokenBalance(typeof user.tokenBalance === 'number' ? user.tokenBalance : Number(user.tokenBalance ?? 0));
      setSubscriptions(Array.isArray(user.subscriptions) ? user.subscriptions : []);
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadPlans = async () => {
      setPlansLoading(true);
      try {
        const response = await fetch('/api/admin/plans');
        if (!response.ok) {
          throw new Error('Failed to load plans');
        }
        const json: unknown = await response.json().catch(() => []);
        if (cancelled) return;
        if (Array.isArray(json)) {
          const mapped = json.reduce<PlanOption[]>((acc, plan) => {
            if (!plan || typeof plan !== 'object') return acc;
            const rec = plan as Record<string, unknown>;
            if (rec.active === false) return acc;
            const id = typeof rec.id === 'string' ? rec.id : String(rec.id ?? '');
            const name = typeof rec.name === 'string' ? rec.name : 'Unnamed plan';
            const durationHours = typeof rec.durationHours === 'number' ? rec.durationHours : Number(rec.durationHours ?? 0);
            const tokenLimit = typeof rec.tokenLimit === 'number' ? rec.tokenLimit : (rec.tokenLimit != null ? Number(rec.tokenLimit) : null);
            acc.push({ id, name, durationHours, tokenLimit });
            return acc;
          }, []);
          setPlans(mapped);
        } else {
          setPlans([]);
        }
      } catch (error) {
        console.error('Failed to load plans', error);
        showToast('Failed to load plans', 'error');
      } finally {
        if (!cancelled) {
          setPlansLoading(false);
        }
      }
    };

    void loadPlans();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleAdjustTokens = async () => {
    if (tokenUpdating) return;
    const parsed = Number(tokenAdjustment);
    if (!Number.isFinite(parsed)) {
      showToast('Enter a numeric token adjustment', 'error');
      return;
    }
    const delta = Math.trunc(parsed);
    if (delta === 0) {
      showToast('Adjustment must be non-zero', 'error');
      return;
    }

    setTokenUpdating(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adjustTokens',
          data: {
            amount: delta,
            reason: tokenReason || undefined
          }
        })
      });

      if (!response.ok) {
        const errJson: unknown = await response.json().catch(() => ({}));
        const rec = (errJson && typeof errJson === 'object') ? errJson as Record<string, unknown> : {};
        const message = typeof rec.error === 'string' ? rec.error : 'Failed to adjust tokens';
        showToast(message, 'error');
        return;
      }

      const json: unknown = await response.json().catch(() => ({}));
      const top = (json && typeof json === 'object') ? json as Record<string, unknown> : {};
      const userRec = top.user && typeof top.user === 'object' ? top.user as Record<string, unknown> : null;
      const updatedBalanceRaw = userRec && userRec.tokenBalance;
      const updatedBalance = typeof updatedBalanceRaw === 'number' ? updatedBalanceRaw : Number(updatedBalanceRaw ?? currentTokenBalance);
      if (Number.isFinite(updatedBalance)) {
        setCurrentTokenBalance(updatedBalance);
        onUserUpdate({ id: user.id, tokenBalance: updatedBalance });
      }
      showToast('Token balance updated', 'success');
      setTokenAdjustment('');
      setTokenReason('');
    } catch (error) {
      console.error('Failed to adjust tokens', error);
      showToast('Failed to adjust tokens', 'error');
    } finally {
      setTokenUpdating(false);
    }
  };

  const handleAssignPlan = async () => {
    if (assignLoading) return;
    if (!selectedPlanId) {
      showToast('Select a plan to assign', 'error');
      return;
    }

    setAssignLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assignPlan',
          data: { planId: selectedPlanId }
        })
      });

      if (!response.ok) {
        const errJson: unknown = await response.json().catch(() => ({}));
        const rec = (errJson && typeof errJson === 'object') ? errJson as Record<string, unknown> : {};
        const message = typeof rec.error === 'string' ? rec.error : 'Failed to assign plan';
        showToast(message, 'error');
        return;
      }

      const json: unknown = await response.json().catch(() => ({}));
      const top = (json && typeof json === 'object') ? json as Record<string, unknown> : {};
      const userRec = top.user && typeof top.user === 'object' ? top.user as Record<string, unknown> : null;
      if (userRec) {
        const balanceRaw = userRec.tokenBalance;
        const newBalance = typeof balanceRaw === 'number' ? balanceRaw : Number(balanceRaw ?? currentTokenBalance);
        if (Number.isFinite(newBalance)) {
          setCurrentTokenBalance(newBalance);
        }
        const updatedSubs = Array.isArray(userRec.subscriptions) ? userRec.subscriptions as SubRecord[] : [];
        setSubscriptions(updatedSubs);
        onUserUpdate({ id: user.id, tokenBalance: newBalance, subscriptions: updatedSubs });
      }

      showToast('Plan assigned successfully', 'success');
      setSelectedPlanId('');
    } catch (error) {
      console.error('Failed to assign plan', error);
      showToast('Failed to assign plan', 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
  const profileWithoutRole = { ...formData } as Record<string, unknown>;
  delete profileWithoutRole.role;
  const payloadData = canManageRoles ? formData : profileWithoutRole;

      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProfile',
          data: payloadData
        })
      });

      if (response.ok) {
        // Treat response as unknown and narrow locally to a minimal shape
        const json: unknown = await response.json().catch(() => ({} as unknown));
        const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object') ? v as Record<string, unknown> : null;
        const top = asRecord(json);
        const userRec = top && typeof top.user === 'object' ? (top.user as Record<string, unknown>) : null;

        const coercedUser = userRec ? {
          id: typeof userRec.id === 'string' ? userRec.id : String(userRec.id ?? ''),
          email: userRec.hasOwnProperty('email') ? (userRec.email === null ? null : String(userRec.email ?? '')) : undefined,
          role: typeof userRec.role === 'string' ? userRec.role : undefined,
        } : null;

        if (coercedUser) onUserUpdate(coercedUser);
        showToast('User updated successfully', 'success');
        onClose();
      } else {
        const errJson: unknown = await response.json().catch(() => ({} as unknown));
        const asRecordErr = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object') ? v as Record<string, unknown> : null;
        const recErr = asRecordErr(errJson);
        const errMsg = recErr && typeof recErr.error === 'string' ? recErr.error : 'Failed to update user';
        showToast(errMsg, 'error');
      }
    } catch (err) {
      console.error('Error updating user:', err);
      showToast('Failed to update user', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl m-4 safe-inset-top max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-neutral-700">
          <h2 className="text-lg font-semibold">Edit User</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Token Balance moved below the dynamic status area to avoid jumping layout */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3 bg-white dark:bg-neutral-900/30 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Adjust Tokens</h3>
                  <span className="text-xs text-neutral-500">Positive to credit, negative to debit</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-300">Amount</label>
                    <input
                      type="number"
                      value={tokenAdjustment}
                      onChange={(e) => setTokenAdjustment(e.target.value)}
                      className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g. 50 or -20"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-300">Reason (optional)</label>
                    <input
                      type="text"
                      value={tokenReason}
                      onChange={(e) => setTokenReason(e.target.value)}
                      className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Visible in notification/email"
                    />
                  </div>
                </div>
                <div className="text-xs text-neutral-500">
                  Adjustment sends an in-app billing notification and email to the user detailing the change.
                </div>
                <button
                  type="button"
                  onClick={handleAdjustTokens}
                  disabled={tokenUpdating}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded text-sm transition-colors"
                >
                  {tokenUpdating ? 'Updating tokens...' : 'Apply Token Adjustment'}
                </button>
              </div>

              <div className="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3 bg-white dark:bg-neutral-900/30 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Assign Plan</h3>
                  {currentPlan ? (
                    <span className="text-xs text-neutral-400">Current: {currentPlan.plan?.name || 'Unknown'}{currentPlan.expiresAt ? ` • Expires ${new Date(currentPlan.expiresAt).toLocaleDateString()}` : ''}</span>
                  ) : (
                    <span className="text-xs text-neutral-500">No active plan</span>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">Plan</label>
                  <select
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select a plan</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} {plan.durationHours ? `• ${Math.round(plan.durationHours / 24)}d` : ''} {plan.tokenLimit != null ? `• +${plan.tokenLimit} tokens` : ''}
                      </option>
                    ))}
                  </select>
                  {/* Plan loading and preview moved below the grid to avoid modal height jumps */}
                </div>
                <div className="text-xs text-neutral-500">
                  Assigning a plan creates or updates the user subscription, grants tokens, and sends confirmation.
                </div>
                <button
                  type="button"
                  onClick={handleAssignPlan}
                  disabled={assignLoading || !selectedPlanId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 px-4 rounded text-sm transition-colors"
                >
                  {assignLoading ? 'Assigning…' : 'Assign Plan'}
                </button>
              </div>

              </div>

      {/* Dynamic plan status area — placed between first and second grid rows with a stable placeholder height */}
      <div className="mt-1">
        <div className="min-h-[48px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
          {plansLoading ? (
            <span>Loading plans…</span>
          ) : selectedPlan ? (
            <span className="text-neutral-400">
              Assigning <span className="font-medium text-neutral-200">{selectedPlan.name}</span> grants
              {selectedPlan.tokenLimit != null ? ` ${selectedPlan.tokenLimit} tokens` : ' unlimited tokens'}
              {selectedPlan.durationHours ? ` for approximately ${Math.round(selectedPlan.durationHours / 24)} days` : ''}.
            </span>
          ) : (
            <span className="text-neutral-500">Select a plan to preview assignment details</span>
          )}
        </div>
      </div>

      {/* Token Balance (moved) */}
      <div>
        <div className="flex items-center justify-between text-sm bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded px-3 py-2">
          <span className="text-neutral-700 dark:text-neutral-300">Token Balance</span>
          <span className="font-mono text-base text-emerald-500 dark:text-emerald-400">{currentTokenBalance}</span>
        </div>
      </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">First Name</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Enter first name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Last Name</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Enter last name"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Enter email address"
                />
              </div>
              {canManageRoles ? (
                <div>
                  <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="USER">User</option>
                    <option value="MODERATOR">Moderator</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Role</label>
                  <div className="w-full rounded px-3 py-2 text-sm border border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
                    {formData.role === 'ADMIN' ? 'Admin' : 'User'}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Only administrators can change roles.</p>
                </div>
              )}
            </div>

            {/* Display additional Clerk info */}
            {user.clerkData && (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-2 bg-white dark:bg-neutral-900/30 shadow-sm">
                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Additional Info</h3>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                  {user.clerkData.lastSignInAt && (
                    <div>Last sign in: {new Date(user.clerkData.lastSignInAt).toLocaleString()}</div>
                  )}
                  <div>Clerk created: {new Date(user.clerkData.createdAt).toLocaleString()}</div>
                  {user.clerkData.phoneNumbers?.length > 0 && (
                    <div>Phone: {user.clerkData.phoneNumbers[0].phoneNumber}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-900/60 p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto bg-neutral-700 hover:bg-neutral-600 text-white py-2 px-4 rounded text-sm transition-colors"
              disabled={loading || tokenUpdating || assignLoading}
            >
              Close
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}
