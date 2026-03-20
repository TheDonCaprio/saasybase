'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { showToast } from '../ui/Toast';
import { dashboardMutedPanelClass, dashboardPanelClass, dashboardPillClass } from '../dashboard/dashboardSurfaces';

type EmailTemplate = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  subject: string;
  htmlBody: string;
  textBody: string | null;
  variables: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Props = {
  initialTemplates: EmailTemplate[];
};

const DEFAULT_TEMPLATE_COUNT = 27;

const DEFAULT_TEMPLATE_GROUPS = [
  {
    title: 'Authentication',
    detail: 'Welcome, password reset, email verification, email change, and magic link flows.'
  },
  {
    title: 'Billing lifecycle',
    detail: 'Activation, renewals, upgrades, downgrades, cancellation, expiry, failed payments, refunds, and plan endings.'
  },
  {
    title: 'Workspace & admin',
    detail: 'Team invitations, admin notifications, plan assignments, and token credit/debit events.'
  },
  {
    title: 'Template safety',
    detail: 'Only missing template keys are created, so any customized templates already in use stay untouched.'
  },
] as const;

export default function EmailTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testTemplate, setTestTemplate] = useState<EmailTemplate | null>(null);
  const [testForm, setTestForm] = useState({ email: '', variables: '' });
  const [sendingTest, setSendingTest] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
    subject: '',
    htmlBody: '',
    textBody: '',
    variables: '',
    active: true
  });

  const numberFormatter = new Intl.NumberFormat('en-US');
  const formatNumber = (value: number) => numberFormatter.format(value);
  const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
  const activeCount = templates.filter((template) => template.active).length;
  const inactiveCount = templates.length - activeCount;
  
  const openEditModal = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      key: template.key,
      description: template.description || '',
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody || '',
      variables: template.variables || '',
      active: template.active
    });
    setIsEditing(true);
  };
  
  const closeModal = () => {
    setIsEditing(false);
    setSelectedTemplate(null);
    setFormData({
      name: '',
      key: '',
      description: '',
      subject: '',
      htmlBody: '',
      textBody: '',
      variables: '',
      active: true
    });
  };
  
  const handleSave = async () => {
    if (!selectedTemplate) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/emails/${selectedTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error('Failed to update template');
      
      const { template } = await res.json();
      setTemplates(prev => prev.map(t => t.id === template.id ? template : t));
      showToast('Template updated successfully', 'success');
      closeModal();
    } catch (error) {
      void error;
      showToast('Failed to update template', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helper to mount modals into document.body via portal (avoids parent layout spacing)
  const mountPortal = (node: React.ReactNode) => typeof document !== 'undefined' ? createPortal(node, document.body) : null;
  
  const handleToggleActive = async (template: EmailTemplate) => {
    try {
      const res = await fetch(`/api/admin/emails/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...template, active: !template.active })
      });
      
      if (!res.ok) throw new Error('Failed to toggle template');
      
      const { template: updated } = await res.json();
      setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
      showToast(`Template ${updated.active ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
      void error;
      showToast('Failed to update template', 'error');
    }
  };
  
  const handleSeedTemplates = async () => {
    setSeedConfirmOpen(false);
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/emails/seed', {
        method: 'POST'
      });
      
      if (!res.ok) throw new Error('Failed to seed templates');
      
      const data = await res.json();
      showToast(data.message, 'success');
      
      // Refresh templates
      const refreshRes = await fetch('/api/admin/emails');
      const { templates: refreshedTemplates } = await refreshRes.json();
      setTemplates(refreshedTemplates);
    } catch (error) {
      void error;
      showToast('Failed to seed templates', 'error');
    } finally {
      setSeeding(false);
    }
  };
  
  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/emails/${templateToDelete.id}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error('Failed to delete template');
      
      setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
      showToast('Template deleted successfully', 'success');
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    } catch (error) {
      void error;
      showToast('Failed to delete template', 'error');
    } finally {
      setDeleting(false);
    }
  };
  
  const openDeleteConfirm = (template: EmailTemplate) => {
    setTemplateToDelete(template);
    setDeleteConfirmOpen(true);
  };
  
  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setTemplateToDelete(null);
  };
  
  const openTestModal = (template: EmailTemplate) => {
    setTestTemplate(template);
    setTestForm({ email: '', variables: '' });
    setTestError(null);
    setSendingTest(false);
  };

  const closeTestModal = () => {
    setTestTemplate(null);
    setTestForm({ email: '', variables: '' });
    setTestError(null);
    setSendingTest(false);
  };

  const handleSendTest = async () => {
    if (!testTemplate) return;

    if (!testForm.email.trim()) {
      setTestError('Recipient email is required.');
      return;
    }

    let parsedVariables: Record<string, unknown> = {};
    if (testForm.variables.trim()) {
      try {
        parsedVariables = JSON.parse(testForm.variables);
      } catch {
        setTestError('Variables must be valid JSON.');
        return;
      }
    }

    setSendingTest(true);
    setTestError(null);
    try {
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: testTemplate.id,
          to: testForm.email.trim(),
          variables: parsedVariables
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || 'Failed to send test email';
        setTestError(message);
        return;
      }

      showToast('Test email sent successfully', 'success');
      closeTestModal();
    } catch (error) {
      void error;
      setTestError('Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const getVariables = (template: EmailTemplate): string[] => {
    try {
      if (!template.variables) return [];
      const parsed = JSON.parse(template.variables);
      return Object.keys(parsed);
    } catch {
      return [];
    }
  };
  
  return (
    <div className="space-y-6">
      <div
        className={dashboardMutedPanelClass(
          'flex flex-col gap-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:text-neutral-300'
        )}
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Template library</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={dashboardPillClass('text-xs font-semibold text-indigo-600 dark:text-indigo-200')}>
              {formatNumber(templates.length)} template{templates.length !== 1 ? 's' : ''}
            </span>
            <span className={dashboardPillClass('text-xs font-semibold text-emerald-600 dark:text-emerald-200')}>
              ✓ {formatNumber(activeCount)} active
            </span>
            <span className={dashboardPillClass('text-xs font-semibold text-amber-600 dark:text-amber-200')}>
              {formatNumber(inactiveCount)} inactive
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSeedConfirmOpen(true)}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/40 dark:bg-neutral-900 dark:text-violet-200 dark:hover:bg-neutral-900/70"
          >
            🌱 {seeding ? 'Seeding…' : 'Seed default templates'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const templateVariables = getVariables(template);
          return (
            <article
              key={template.id}
              className={dashboardPanelClass(
                'flex h-full flex-col gap-4 p-4 transition-shadow hover:shadow-lg'
              )}
            >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="space-y-0.5">
                  <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-neutral-50">{template.name}</h3>
                  <p className="text-[10px] font-mono uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                    {template.key}
                  </p>
                </div>
                {template.description ? (
                  <p className="text-xs text-slate-500 dark:text-neutral-400">{template.description}</p>
                ) : null}
              </div>
              <button
                onClick={() => handleToggleActive(template)}
                className={clsx(
                  'inline-flex shrink-0 self-start items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900',
                  template.active
                    ? 'border-emerald-200 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 focus-visible:ring-emerald-400 dark:border-emerald-500/40 dark:text-emerald-200'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus-visible:ring-slate-400 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-300'
                )}
              >
                {template.active ? '✓ Active' : 'Activate'}
              </button>
            </div>

            <div className="flex-1 space-y-2 text-sm">
              <div className="flex items-baseline gap-2 text-slate-600 dark:text-neutral-300">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  Subject
                </span>
                <span className="truncate text-xs leading-relaxed">{template.subject}</span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  Variables
                </span>
                {templateVariables.length > 0 ? (
                  templateVariables.map((varName) => (
                    <span
                      key={varName}
                      className={dashboardPillClass(
                        'px-1.5 py-0.5 text-[9px] font-mono uppercase text-indigo-600 dark:text-indigo-200'
                      )}
                    >
                      {`{{${varName}}}`}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-slate-400 dark:text-neutral-500">None</span>
                )}
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:text-neutral-400">
              <span>
                Updated {dateFormatter.format(new Date(template.updatedAt))}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => openTestModal(template)}
                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 dark:border-emerald-500/40 dark:text-emerald-200 dark:focus-visible:ring-offset-neutral-900"
                >
                  Send test
                </button>
                <button
                  onClick={() => openEditModal(template)}
                  className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:border-indigo-500/40 dark:text-indigo-200 dark:focus-visible:ring-offset-neutral-900"
                >
                  Edit template
                </button>
                <button
                  onClick={() => openDeleteConfirm(template)}
                  className="inline-flex items-center rounded-full border border-rose-200 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 dark:border-rose-500/40 dark:text-rose-200 dark:focus-visible:ring-offset-neutral-900"
                >
                  Delete
                </button>
              </div>
            </div>
            </article>
          );
        })}
      </div>

      {templates.length === 0 ? (
        <div className={dashboardPanelClass('py-16 text-center text-sm text-slate-500 dark:text-neutral-300')}>
          <p className="mb-4 text-base font-medium text-slate-700 dark:text-neutral-100">No email templates found</p>
          <p>Seed the default library to get started with transactional and marketing flows.</p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setSeedConfirmOpen(true)}
              disabled={seeding}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/40 dark:bg-neutral-900 dark:text-violet-200 dark:hover:bg-neutral-900/70"
            >
              🌱 {seeding ? 'Seeding…' : 'Seed default templates'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Send Test Modal */}
      {testTemplate && mountPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto !mt-0">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl max-w-2xl w-full my-8">
            <div className="flex items-center justify-between p-6 border-b border-neutral-800">
              <div>
                <h2 className="text-xl font-semibold text-white">Send Test Email</h2>
                <p className="text-sm text-neutral-400 mt-1">{testTemplate.name} — {testTemplate.key}</p>
              </div>
              <button
                onClick={closeTestModal}
                disabled={sendingTest}
                className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Recipient Email</label>
                <input
                  type="email"
                  value={testForm.email}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTestForm(prev => ({ ...prev, email: value }));
                    setTestError(null);
                  }}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white"
                  placeholder="you@example.com"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-800/60">
                <p className="mb-2.5 font-medium text-slate-700 dark:text-neutral-200">Variables available for this template:</p>
                <div className="flex flex-wrap gap-1.5">
                  {getVariables(testTemplate).length > 0 ? (
                    getVariables(testTemplate).map((name) => (
                      <code key={name} className="rounded px-2 py-0.5 text-xs font-mono bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                        {`{{${name}}}`}
                      </code>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-neutral-500">No variables defined</span>
                  )}
                </div>
              </div>

              {testError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-600 rounded px-3 py-2">
                  {testError}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={closeTestModal}
                disabled={sendingTest}
                className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendTest}
                disabled={sendingTest}
                className="flex-1 rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {sendingTest ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Modal */}
      {isEditing && selectedTemplate && mountPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto !mt-0">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl max-w-4xl w-full my-8">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-neutral-800">
              <div>
                <h2 className="text-xl font-semibold text-white">Edit Template</h2>
                <p className="text-sm text-neutral-400 mt-1">{selectedTemplate.key}</p>
              </div>
              <button
                onClick={closeModal}
                disabled={loading}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white"
                  placeholder="Optional description of when this template is used"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white font-mono text-sm"
                  placeholder="Use {{variable}} for dynamic content"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  HTML Body
                </label>
                <textarea
                  value={formData.htmlBody}
                  onChange={(e) => setFormData(prev => ({ ...prev, htmlBody: e.target.value }))}
                  rows={15}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white font-mono text-xs"
                  placeholder="HTML email template with {{variable}} placeholders"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Plain Text Body (Optional)
                </label>
                <textarea
                  value={formData.textBody}
                  onChange={(e) => setFormData(prev => ({ ...prev, textBody: e.target.value }))}
                  rows={8}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white font-mono text-sm"
                  placeholder="Plain text fallback for email clients that don't support HTML"
                />
              </div>
              
              <div className="bg-blue-900/20 border border-blue-700 rounded p-4">
                <p className="text-sm text-blue-300 font-medium mb-2">📝 Available Variables</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {['firstName', 'lastName', 'fullName', 'userEmail', 'transactionId', 
                    'amount', 'planName', 'tokenAmount', 'tokenName', 'expiresAt', 
                    'startedAt', 'siteName', 'supportEmail', 'dashboardUrl', 'billingUrl', 'siteLogo'].map(v => (
                    <code key={v} className="text-blue-400">{`{{${v}}}`}</code>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={closeModal}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>)}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && templateToDelete && mountPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 !mt-0">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Delete Template</h3>
                  <p className="text-sm text-neutral-400">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-neutral-800/50 border border-neutral-700 rounded p-3 mb-4">
                <p className="text-sm text-white font-medium">{templateToDelete.name}</p>
                <p className="text-xs text-neutral-400 font-mono mt-1">{templateToDelete.key}</p>
              </div>
              
              <p className="text-sm text-neutral-300 mb-6">
                Are you sure you want to delete this email template? This will permanently remove it from your system.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={closeDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteTemplate}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Template'}
                </button>
              </div>
            </div>
          </div>
        </div>)}
      
      {/* Seed Confirmation Modal */}
      {seedConfirmOpen && mountPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 !mt-0">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Seed Default Templates</h3>
                  <p className="text-sm text-neutral-400">Add the latest branded starter set</p>
                </div>
              </div>
              
              <p className="text-sm text-neutral-300 mb-4">
                This will add {DEFAULT_TEMPLATE_COUNT} polished email templates covering auth, billing, workspace invites, and admin notifications.
              </p>
              
              <div className="bg-neutral-800/50 border border-neutral-700 rounded p-3 mb-6">
                <ul className="text-xs text-neutral-300 space-y-2">
                  {DEFAULT_TEMPLATE_GROUPS.map((group) => (
                    <li key={group.title}>
                      <span className="font-semibold text-white">• {group.title}:</span>{' '}
                      <span>{group.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <p className="text-xs text-yellow-400 mb-6">
                Existing templates with matching keys are left exactly as they are. Only missing defaults will be added.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setSeedConfirmOpen(false)}
                  disabled={seeding}
                  className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSeedTemplates}
                  disabled={seeding}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {seeding ? 'Seeding...' : 'Seed Missing Templates'}
                </button>
              </div>
            </div>
          </div>
        </div>)}
    </div>
  );
}
