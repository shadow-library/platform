import { isApiError } from '@shadow-library/web';

import { accountApi, type AccountResponseDto, type ExportJobResponseDto, stepUpUrl } from '@/lib/apis';
import {
  type AccountCommand,
  type AccountDevice,
  type AccountProvider,
  type AppSyncView,
  type BehaviourPreferences,
  BILLING_INVOICES_LINE,
  BILLING_MANAGE_NOTE,
  BILLING_TRIAL_LINE,
  billingPlans,
  type BillingView,
  type DayPreferences,
  DELETION_ACKNOWLEDGEMENTS,
  DELETION_ALTERNATIVES,
  DELETION_GRACE_NOTE,
  type DeletionView,
  type ExportJob,
  exportJobCopy,
  type ExportView,
  type HeroIntensityMode,
  INSTALL_ROWS,
  NOTIFICATION_SEEDS,
  type NotificationSettings,
  OFFLINE_CAPABILITIES,
  type OnboardingStatus,
  ONLINE_ONLY_NOTE,
  type QueueEntry,
  REAUTH_HANDOFF_COPY,
  SESSION_NOTE,
  type SettledCommandResult,
  SYNC_COPY,
} from '@/lib/data';

import { projectEntitlement, projectRecordCounts } from './projection';
import { type SyncEngine } from './sync-engine';
import { SYNC_META_KEYS } from './sync.types';

const INTENSITY_LOCAL: Record<string, HeroIntensityMode> = { low_intensity: 'gentle', standard: 'standard', high_intensity: 'demanding' };

const INTENSITY_WIRE: Record<HeroIntensityMode, 'low_intensity' | 'standard' | 'high_intensity'> = {
  gentle: 'low_intensity',
  standard: 'standard',
  demanding: 'high_intensity',
};

const EXPORT_STAGES: Record<ExportJobResponseDto['status'], ExportJob['stage']> = { pending: 'preparing', running: 'preparing', done: 'ready', failed: 'failed' };

function toClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function toMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':');
  return Number(hours) * 60 + Number(minutes ?? 0);
}

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

function rejected(message: string): SettledCommandResult {
  return { status: 'rejected', message };
}

function errorCode(error: unknown): string | null {
  return isApiError(error) ? error.code : null;
}

/** The message the server sent, which already reads as a sentence — a hand-written substitute would only be less accurate. */
function refusal(error: unknown, fallback: string): SettledCommandResult {
  return rejected(isApiError(error) ? error.message : fallback);
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unnamed device';
  const browser = ['Firefox', 'Edg', 'Chrome', 'Safari'].find(name => userAgent.includes(name));
  const platform = ['iPhone', 'iPad', 'Android', 'Macintosh', 'Windows', 'Linux'].find(name => userAgent.includes(name));
  if (!browser && !platform) return userAgent.slice(0, 60);
  return [browser === 'Edg' ? 'Edge' : browser, platform].filter(Boolean).join(' · ');
}

/**
 * The account surfaces, online-first (ARCHITECTURE §9.1). Settings, export, deletion and billing are
 * request/response rather than outbox commands: none of them is something an offline owner can be told
 * succeeded. What the delta mirror is used for is the parts the endpoints do not answer — the registered
 * devices, the entitlement, and the record counts the export and deletion screens describe.
 *
 * Local-only by construction: `behaviour.set` (browser presentation preferences the account row has no
 * column for) and the install/offline copy on the sync screen.
 */
export class SyncedAccountProvider implements AccountProvider {
  private behaviour: BehaviourPreferences = { compactDensity: false, reduceMotion: false, dailyJournalPrompt: false, showCosmetics: true };
  private acknowledged = new Set<string>();
  private awaitingReauth = false;

  constructor(private readonly sync: SyncEngine) {}

  private async account(): Promise<AccountResponseDto> {
    return accountApi.get();
  }

  async getDay(): Promise<DayPreferences> {
    const account = await this.account();
    return {
      wakeTime: toClock(account.scheduleStartMin),
      sleepTime: toClock(account.scheduleEndMin),
      timezone: account.timezone,
      pendingTimezone: account.pendingTimezone ?? null,
      intensity: INTENSITY_LOCAL[account.intensityMode] ?? 'standard',
      pendingIntensity: account.pendingIntensityMode ? (INTENSITY_LOCAL[account.pendingIntensityMode] ?? null) : null,
      currency: account.defaultCurrency,
      currencyLocked: account.onboardingCompletedAt !== null && account.onboardingCompletedAt !== undefined,
    };
  }

  getBehaviour(): Promise<BehaviourPreferences> {
    return Promise.resolve({ ...this.behaviour });
  }

  async getOnboarding(): Promise<OnboardingStatus> {
    const account = await this.account();
    return { completed: account.onboardingCompletedAt !== null && account.onboardingCompletedAt !== undefined };
  }

  async getNotifications(): Promise<NotificationSettings> {
    const account = await this.account();
    const device = await this.currentDeviceRow();
    const pushOptIn = device ? device['pushOptIn'] === true : false;

    return {
      pushPermission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
      permissionNote: pushOptIn
        ? 'Push is on for this browser. Every category below is email, and each is off until you turn it on.'
        : 'Push is off for this browser. Turning it on is what asks the browser for permission.',
      pushOptIn,
      preferences: NOTIFICATION_SEEDS.map(seed => ({ ...seed, email: account.notificationPrefs[seed.id] })),
    };
  }

  async getBilling(): Promise<BillingView> {
    const entitlement = projectEntitlement(this.sync.domains());
    const paid = entitlement.tier === 'paid';
    const until = entitlement.expiresAt ? ` · through ${entitlement.expiresAt.slice(0, 10)}` : '';

    return {
      plans: billingPlans(paid ? 'coach' : 'free'),
      status: paid ? `Coach · ${entitlement.state}${until}` : 'Free · no payment method on file',
      quotaLine: paid ? 'A daily allowance, reset at your local midnight.' : 'Two coaching requests a month, reset on the first.',
      trialLine: entitlement.trialUsed ? 'The trial has been used on this account.' : BILLING_TRIAL_LINE,
      invoicesLine: BILLING_INVOICES_LINE,
      manageNote: BILLING_MANAGE_NOTE,
    };
  }

  async getExport(): Promise<ExportView> {
    const sets = projectRecordCounts(this.sync.domains());
    const jobId = await this.sync.store.readMeta<string>(SYNC_META_KEYS.exportJobId);
    if (!jobId) return { sets, job: exportJobCopy('idle', null) };

    try {
      const job = await accountApi.exportStatus(jobId);
      return { sets, job: exportJobCopy(EXPORT_STAGES[job.status], job.downloadUrl ?? null) };
    } catch (error) {
      if (errorCode(error) !== 'EXP_001') throw error;
      await this.sync.store.writeMeta(SYNC_META_KEYS.exportJobId, null);
      return { sets, job: exportJobCopy('idle', null) };
    }
  }

  /**
   * The status read is behind the same elevation as the start, so a non-elevated owner is answered
   * `IAM_003` rather than a state — which is exactly the "nothing has begun" the screen should show.
   */
  async getDeletion(): Promise<DeletionView> {
    const base = {
      sets: projectRecordCounts(this.sync.domains()),
      acknowledgements: DELETION_ACKNOWLEDGEMENTS,
      acknowledged: [...this.acknowledged],
      reauth: { ...REAUTH_HANDOFF_COPY, continueTo: stepUpUrl(typeof window === 'undefined' ? '/settings/delete' : window.location.pathname) },
      alternatives: DELETION_ALTERNATIVES,
      gracePeriodNote: DELETION_GRACE_NOTE,
    };

    try {
      const status = await accountApi.deletionStatus();
      if (status.deletionState === 'none') return { ...base, stage: this.awaitingReauth ? 'awaiting-reauth' : 'idle', stateNote: null };
      return { ...base, stage: 'scheduled', stateNote: `Erasure in progress · ${status.deletionState.replace(/_/g, ' ')}` };
    } catch (error) {
      if (errorCode(error) !== 'IAM_003') throw error;
      return { ...base, stage: this.awaitingReauth ? 'awaiting-reauth' : 'idle', stateNote: null };
    }
  }

  async getAppSync(): Promise<AppSyncView> {
    const snapshot = this.sync.getSnapshot();
    const status: AppSyncView['status'] = snapshot.state === 'signed-out' ? 'failed' : snapshot.state;
    const pending = await this.sync.outbox.pending();
    const queue: QueueEntry[] = pending.map((entry, index) => ({
      id: entry.commandId,
      state: 'queued',
      text: entry.type,
      meta: `Created ${entry.createdAt.slice(11, 16)} · position ${index + 1}`,
      retryable: false,
    }));

    return {
      status,
      ...SYNC_COPY[status],
      queuedCount: snapshot.queuedCount,
      lastSyncedAt: snapshot.lastSyncedAt,
      queue,
      devices: await this.devices(),
      installRows: INSTALL_ROWS,
      offlineCapabilities: OFFLINE_CAPABILITIES,
      onlineOnly: ONLINE_ONLY_NOTE,
      sessionNote: SESSION_NOTE,
    };
  }

  private async currentDeviceId(): Promise<string | undefined> {
    return this.sync.store.readMeta<string>(SYNC_META_KEYS.deviceId);
  }

  private async currentDeviceRow(): Promise<Record<string, unknown> | undefined> {
    const deviceId = await this.currentDeviceId();
    return (this.sync.domains().devices ?? []).find(row => String(row['id']) === deviceId);
  }

  private async devices(): Promise<AccountDevice[]> {
    const currentId = await this.currentDeviceId();
    return (this.sync.domains().devices ?? []).map(row => ({
      id: String(row['id']),
      name: deviceLabel(typeof row['userAgent'] === 'string' ? row['userAgent'] : null),
      meta: typeof row['lastSeenAt'] === 'string' ? `Last seen ${row['lastSeenAt'].slice(0, 10)}` : 'Not seen yet',
      current: String(row['id']) === currentId,
    }));
  }

  async dispatchCommand(command: AccountCommand): Promise<SettledCommandResult> {
    switch (command.type) {
      case 'behaviour.set':
        this.behaviour = { ...this.behaviour, ...command.patch };
        return applied('Saved on this device.');

      case 'day.set':
        return this.patchDay(command.patch);

      case 'onboarding.complete':
        try {
          await accountApi.onboard({
            defaultCurrency: command.submission.currency,
            timezone: command.submission.timezone,
            scheduleStartMin: toMinutes(command.submission.wakeTime),
            scheduleEndMin: toMinutes(command.submission.sleepTime),
          });
          return applied('Set up. Your home currency is fixed from here so your totals stay comparable.');
        } catch (error) {
          return refusal(error, 'That could not be saved.');
        }

      case 'notification.set':
        try {
          await accountApi.patch({ notificationPrefs: { [command.preferenceId]: command.enabled } });
          return applied(command.enabled ? 'On. Sent by email only.' : 'Off.');
        } catch (error) {
          return refusal(error, 'That preference could not be saved.');
        }

      case 'notification.setPush':
        return this.setPush(command.enabled);

      case 'device.remove':
        try {
          await accountApi.removeDevice(command.deviceId);
          void this.sync.sync();
          return applied('That device will stop receiving notifications.');
        } catch (error) {
          return refusal(error, 'That device could not be removed.');
        }

      case 'billing.checkout':
        try {
          const session = await accountApi.checkout({ plan: command.plan });
          if (typeof window !== 'undefined') window.location.assign(session.url);
          return applied('Opening the payment provider’s checkout.');
        } catch (error) {
          return refusal(error, 'Checkout could not be started.');
        }

      case 'export.prepare':
        try {
          const job = await accountApi.requestExport();
          await this.sync.store.writeMeta(SYNC_META_KEYS.exportJobId, job.id);
          return applied('Preparing your archive. You can leave this page.');
        } catch (error) {
          return refusal(error, 'The export could not be started.');
        }

      case 'export.dismiss':
        await this.sync.store.writeMeta(SYNC_META_KEYS.exportJobId, null);
        return applied('');

      case 'deletion.acknowledge':
        if (command.acknowledged) this.acknowledged.add(command.acknowledgementId);
        else this.acknowledged.delete(command.acknowledgementId);
        return applied('');

      case 'deletion.begin':
        return this.beginDeletion();

      default:
        this.acknowledged.clear();
        this.awaitingReauth = false;
        return applied('Stopped. Nothing was started and nothing was deleted.');
    }
  }

  private async patchDay(patch: Extract<AccountCommand, { type: 'day.set' }>['patch']): Promise<SettledCommandResult> {
    try {
      const account = await accountApi.patch({
        ...(patch.wakeTime === undefined ? {} : { scheduleStartMin: toMinutes(patch.wakeTime) }),
        ...(patch.sleepTime === undefined ? {} : { scheduleEndMin: toMinutes(patch.sleepTime) }),
        ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
        ...(patch.intensity === undefined ? {} : { intensityMode: INTENSITY_WIRE[patch.intensity] }),
      });

      const deferred = patch.timezone !== undefined ? account.pendingTimezone : patch.intensity !== undefined ? account.pendingIntensityMode : null;
      if (deferred) return applied('Staged. It takes effect at your next daily rollover, so the day in progress is not rewritten.');
      return applied('Saved. Changing your wake window never rewrites past days.');
    } catch (error) {
      return refusal(error, 'That setting could not be saved.');
    }
  }

  private async setPush(enabled: boolean): Promise<SettledCommandResult> {
    const deviceId = await this.currentDeviceId();
    if (!deviceId) return rejected('This browser has not registered with the server yet. It does so on the next sync.');

    try {
      await accountApi.updateDevice(deviceId, { pushOptIn: enabled });
      void this.sync.sync();
      return applied(enabled ? 'Push is on for this browser.' : 'Push is off for this browser.');
    } catch (error) {
      return refusal(error, 'That could not be saved for this device.');
    }
  }

  /**
   * The screen stops here on purpose. `IAM_003` is the elevation boundary, and nothing about it is an
   * error to report — it is the handoff, so the owner is shown the step-up link rather than a failure.
   */
  private async beginDeletion(): Promise<SettledCommandResult> {
    if (this.acknowledged.size < DELETION_ACKNOWLEDGEMENTS.length) return rejected('Both statements need to be true before anything goes further.');

    try {
      await accountApi.startDeletion();
      this.awaitingReauth = false;
      return applied('The erasure has started. It runs to completion on its own, and it cannot be undone.');
    } catch (error) {
      if (errorCode(error) !== 'IAM_003') return refusal(error, 'That could not be started.');
      this.awaitingReauth = true;
      return applied('Nothing is scheduled yet. The next confirmation happens on your Shadow account.');
    }
  }
}
