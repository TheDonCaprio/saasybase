'use client';

import { useState } from 'react';
import { useAuthUser, useAuthInstance } from '@/lib/auth-provider/client';
import { showToast } from '../ui/Toast';
import { ClerkProfileModal } from './ClerkProfileModal';

// Extend window interface for Clerk with unknown to avoid unsafe any
declare global {
  interface Window {
    Clerk?: unknown;
  }
}

interface ProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
}

export function ProfileManagement() {
  const { user, isLoaded } = useAuthUser();
  const { openUserProfile } = useAuthInstance();
  // keep reference to imported clerk helper to avoid unused-var lint in some builds
  void openUserProfile;
  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.emailAddresses?.[0]?.emailAddress || ''
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  if (!isLoaded) {
    return <div className="h-32 animate-pulse rounded bg-neutral-800"></div>;
  }

  const handleUpdateProfile = async () => {
    if (!user) return;
    
    setIsUpdating(true);
    try {
      // Update first name
      if (formData.firstName !== user.firstName) {
        await user.update({ firstName: formData.firstName });
      }
      
      // Update last name  
      if (formData.lastName !== user.lastName) {
        await user.update({ lastName: formData.lastName });
      }

      showToast('Profile updated successfully', 'success');
    } catch (error) {
      console.error('Profile update error:', error);
      showToast('Failed to update profile', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== 'DELETE MY ACCOUNT') return;
    
    try {
      // First delete user data from our database
      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to delete account data');
      }

      // Then delete the user account via Clerk
      await user.delete();
      
      // Clerk will handle the redirect after deletion
      showToast('Account deletion completed successfully', 'success');
    } catch (error) {
      console.error('Account deletion error:', error);
      showToast('Failed to delete account. Please try again or contact support.', 'error');
    }
  };

  const hasChanges = formData.firstName !== (user?.firstName || '') || 
                    formData.lastName !== (user?.lastName || '');

  return (
    <div className="space-y-5">
      {/* Profile Information */}
      <div className="rounded border border-neutral-700 bg-neutral-900 p-5">
        <h3 className="mb-4 text-lg font-medium text-white">Profile Information</h3>
        
        <div className="max-w-md space-y-3.5">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              First Name
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your first name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Last Name
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your last name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-neutral-300 cursor-not-allowed"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Email changes must be done through your account settings
            </p>
          </div>

          {hasChanges && (
            <button
              onClick={handleUpdateProfile}
              disabled={isUpdating}
              className="rounded px-3.5 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {isUpdating ? 'Updating...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Account Actions */}
      <div className="rounded border border-neutral-700 bg-neutral-900 p-5">
        <h3 className="mb-4 text-lg font-medium text-white">Account Actions</h3>
        
        <div className="space-y-3">
          {/* Password Change */}
          <div className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800 p-3">
            <div>
              <div className="font-medium text-white">Change Password</div>
              <div className="text-sm text-neutral-400">Update your account password</div>
            </div>
            <ClerkProfileModal
              trigger={
                <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700">
                  Change Password
                </button>
              }
            />
          </div>

          {/* Email Management */}
          <div className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800 p-3">
            <div>
              <div className="font-medium text-white">Email Settings</div>
              <div className="text-sm text-neutral-400">Add or change your email addresses</div>
            </div>
            <ClerkProfileModal
              trigger={
                <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700">
                  Manage Email
                </button>
              }
            />
          </div>

          {/* Two-Factor Authentication */}
          <div className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800 p-3">
            <div>
              <div className="font-medium text-white">Two-Factor Authentication</div>
              <div className="text-sm text-neutral-400">Enhance your account security with 2FA</div>
            </div>
            <ClerkProfileModal
              trigger={
                <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700">
                  Setup 2FA
                </button>
              }
              mode="security"
            />
          </div>

          {/* Account Deletion */}
          <div className="rounded border border-red-700/50 bg-red-900/10 p-4">
            <h4 className="mb-2 font-medium text-red-400">Danger Zone</h4>
            <div className="mb-3 text-sm text-neutral-300">
              Permanently delete your account and all associated data. This action cannot be undone.
            </div>
            
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700"
              >
                Delete Account
              </button>
            ) : (
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium mb-2 text-white">Type &quot;DELETE MY ACCOUNT&quot; to confirm:</div>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full bg-neutral-800 border border-red-700 rounded px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="DELETE MY ACCOUNT"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'DELETE MY ACCOUNT'}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete Account
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                    }}
                    className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
