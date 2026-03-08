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
    return <div className="animate-pulse bg-neutral-800 rounded h-32"></div>;
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
    <div className="space-y-6">
      {/* Profile Information */}
      <div className="border border-neutral-700 rounded p-6 bg-neutral-900">
        <h3 className="text-lg font-medium mb-4 text-white">Profile Information</h3>
        
        <div className="space-y-4 max-w-md">
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
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUpdating ? 'Updating...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Account Actions */}
      <div className="border border-neutral-700 rounded p-6 bg-neutral-900">
        <h3 className="text-lg font-medium mb-4 text-white">Account Actions</h3>
        
        <div className="space-y-4">
          {/* Password Change */}
          <div className="flex items-center justify-between p-3 bg-neutral-800 rounded border border-neutral-700">
            <div>
              <div className="font-medium text-white">Change Password</div>
              <div className="text-sm text-neutral-400">Update your account password</div>
            </div>
            <ClerkProfileModal
              trigger={
                <button className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors">
                  Change Password
                </button>
              }
            />
          </div>

          {/* Email Management */}
          <div className="flex items-center justify-between p-3 bg-neutral-800 rounded border border-neutral-700">
            <div>
              <div className="font-medium text-white">Email Settings</div>
              <div className="text-sm text-neutral-400">Add or change your email addresses</div>
            </div>
            <ClerkProfileModal
              trigger={
                <button className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors">
                  Manage Email
                </button>
              }
            />
          </div>

          {/* Two-Factor Authentication */}
          <div className="flex items-center justify-between p-3 bg-neutral-800 rounded border border-neutral-700">
            <div>
              <div className="font-medium text-white">Two-Factor Authentication</div>
              <div className="text-sm text-neutral-400">Enhance your account security with 2FA</div>
            </div>
            <ClerkProfileModal
              trigger={
                <button className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors">
                  Setup 2FA
                </button>
              }
              mode="security"
            />
          </div>

          {/* Account Deletion */}
          <div className="border border-red-700/50 rounded p-4 bg-red-900/10">
            <h4 className="font-medium text-red-400 mb-2">Danger Zone</h4>
            <div className="text-sm text-neutral-300 mb-3">
              Permanently delete your account and all associated data. This action cannot be undone.
            </div>
            
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
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
                    className="px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Delete Account
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                    }}
                    className="px-3 py-2 border border-neutral-700 text-neutral-300 text-sm rounded hover:bg-neutral-800 transition-colors"
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
