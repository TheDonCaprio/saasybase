import { EnvironmentSettingsList } from './EditableSettings';
import { SystemBadge } from './settings/SystemBadge';
import type { AdminEnvironmentSetting, AdminRuntimeSnapshot } from '@/lib/admin-system-snapshot';

export function AdminSystemPanel({
  environmentSettings,
  runtimeSnapshot,
}: {
  environmentSettings: AdminEnvironmentSetting[];
  runtimeSnapshot: AdminRuntimeSnapshot;
}) {
  const databaseType = environmentSettings.find((setting) => setting.key === 'DATABASE_TYPE')?.value ?? 'N/A';
  const nodeEnv = environmentSettings.find((setting) => setting.key === 'NODE_ENV')?.value ?? 'development';

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Operational snapshot</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
              Real-time server diagnostics pulled during page render so admins can quickly confirm runtime posture, capacity, and deployment mode.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <SystemBadge label="Node" value={runtimeSnapshot.nodeVersion} tone="blue" />
            <SystemBadge label="Demo mode" value={runtimeSnapshot.demoMode} tone={runtimeSnapshot.demoMode === 'Enabled' ? 'amber' : 'emerald'} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 min-[834px]:grid-cols-4">
        <SystemBadge
          label="Maintenance mode"
          value={runtimeSnapshot.maintenanceMode}
          tone={runtimeSnapshot.maintenanceMode === 'Enabled' ? 'amber' : 'emerald'}
        />
        <SystemBadge label="Database" value={databaseType} tone="blue" />
        <SystemBadge
          label="File storage"
          value={runtimeSnapshot.fileStorage}
          tone={runtimeSnapshot.fileStorage === 'S3 Bucket' ? 'violet' : 'slate'}
        />
        <SystemBadge label="Node env" value={nodeEnv} tone="slate" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:shadow-lg">
          <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">Application runtime</h3>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-3">
            <SystemBadge label="Auth" value={runtimeSnapshot.authProvider} tone="violet" />
            <SystemBadge label="Payments" value={runtimeSnapshot.paymentProvider} tone="blue" />
            <SystemBadge label="Email" value={runtimeSnapshot.emailDelivery} tone="amber" />
            <SystemBadge label="App uptime" value={runtimeSnapshot.appUptime} tone="emerald" />
            <SystemBadge label="Host uptime" value={runtimeSnapshot.hostUptime} tone="amber" />
            <SystemBadge label="Timezone" value={runtimeSnapshot.timezone} tone="slate" />
          </div>
        </div>
        <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:shadow-lg">
          <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">Machine profile</h3>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-3">
            <SystemBadge label="Platform" value={runtimeSnapshot.platform} tone="slate" />
            <SystemBadge label="Arch" value={runtimeSnapshot.architecture} tone="slate" />
            <SystemBadge label="CPU" value={runtimeSnapshot.cpuCores} tone="blue" />
            <SystemBadge label="Total RAM" value={runtimeSnapshot.totalMemory} tone="emerald" />
            <SystemBadge label="Free RAM" value={runtimeSnapshot.freeMemory} tone="emerald" />
            <SystemBadge label="RSS / Heap" value={`${runtimeSnapshot.rssMemory} / ${runtimeSnapshot.heapUsed}`} tone="amber" />
          </div>
        </div>
      </div>
      <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:shadow-lg">
        <EnvironmentSettingsList
          settings={environmentSettings}
          title="Platform configuration"
          description="Read-only environment flags and integration toggles currently active in this deployment."
          badgeText="Immutable"
        />
      </div>
    </div>
  );
}