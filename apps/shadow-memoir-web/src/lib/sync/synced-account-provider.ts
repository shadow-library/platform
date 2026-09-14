import { isApiError } from '@shadow-library/web';

import { accountApi, type AccountResponseDto, type ExportJobResponseDto } from '@/lib/apis';
import { formatEnum, formatLocalDate, formatLocalTime } from '@/lib/format';
import {
  type AccountCommand,
  type AccountDevice,
  type AccountProvider,
  type AppSyncView,
  BILLING_INVOICES_LINE,
  BILLING_MANAGE_NOTE,
  type BillingPeriod,
  billingPlans,
  type BillingView,
  commandLabel,
  commandRefusal,
  type DayPreferences,
  type DeletionView,
  DEVICE_REMOVED,
  EXPORT_EXPIRED_NOTICE,
  type ExportJob,
  exportJobCopy,
  exportStageWhen,
  type ExportView,
  type FailedChange,
  failureCopy,
  type HeroIntensityMode,
  NOTIFICATION_SEEDS,
  type NotificationSettings,
  OFFLINE_CAPABILITIES,
  type OnboardingStatus,
  ONLINE_ONLY_NOTE,
  type QueueEntry,
  SESSION_NOTE,
  type SettledCommandResult,
  SYNC_COPY,
} from '@/lib/data';

import { AccountBoundaryError } from './memoir-store';
import { projectEntitlement, projectRecordCounts } from './projection';
import { type SyncEngine } from './sync-engine';
import { SyncedDeletion } from './synced-deletion';
import { SYNC_META_KEYS } from './sync.types';

const INTENSITY_LOCAL: Record<string, HeroIntensityMode> = { low_intensity: 'gentle', standard: 'standard', high_intensity: 'demanding' };

const INTENSITY_WIRE: Record<HeroIntensityMode, 'low_intensity' | 'standard' | 'high_intensity'> = {
  gentle: 'low_intensity',
  standard: 'standard',
  demanding: 'high_intensity',
};

const EXPORT_STAGES: Record<ExportJobResponseDto['status'], Exclude<ExportJob['stage'], 'idle'>> = { pending: 'preparing', running: 'preparing', done: 'ready', failed: 'failed' };

const BILLING_STATE_LABELS: Record<string, string> = { free: 'Free', trial: 'Trial', active: 'Active', grace: 'Payment past due', lapsed: 'Lapsed' };

const DEFERRED_MESSAGE = 'Staged. It takes effect at your next daily rollover, so the day in progress is not rewritten.';

function toClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function toMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':');
  return Number(hours) * 60 + Number(minutes ?? 0);
}

/** The server stages `timezone`/`intensityMode` unconditionally, even back onto the value that is already active — a real stage is only one that differs from it. */
function pendingValue<T>(pending: T | null | undefined, active: T): T | null {
  return pending != null && pending !== active ? pending : null;
}

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

function errorCode(error: unknown): string | null {
  return isApiError(error) ? error.code : null;
}

function deviceLabel(userAgent: string | null): string {
  const agent = userAgent?.trim();
  if (!agent) return 'Unnamed device';
  const browser = ['Firefox', 'Edg', 'Chrome', 'Safari'].find(name => agent.includes(name));
  const platform = ['iPhone', 'iPad', 'Android', 'Macintosh', 'Windows', 'Linux'].find(name => agent.includes(name));
  if (!browser && !platform) return agent;
  return [browser === 'Edg' ? 'Edge' : browser, platform].filter(Boolean).join(' · ');
}

function lastSeen(value: unknown): string {
  if (typeof value !== 'string' || !formatLocalDate(value)) return 'Not seen yet';
  return `Last seen ${formatLocalDate(value)} at ${formatLocalTime(value)}`;
}

/**
 * The account surfaces, online-first (ARCHITECTURE §9.1). Settings, export, deletion and billing are
 * request/response rather than outbox commands: none of them is something an offline owner can be told
 * succeeded. What the delta mirror is used for is the parts the endpoints do not answer — the registered
 * devices, the entitlement, and the record counts the export and deletion screens describe.
 *
 * Local-only by construction: the changes this device's outbox dead-lettered.
 */
export class SyncedAccountProvider implements AccountProvider {
  private readonly deletion: SyncedDeletion;
  /** In-memory so a background refetch can't lose it by re-reading an already-cleared jobId; reset on prepare/dismiss. */
  private expiredExportNotice: string | null = null;

  constructor(
    private readonly sync: SyncEngine,
    principal?: () => Promise<string>,
  ) {
    this.deletion = new SyncedDeletion(sync, principal);
  }

  private async account(): Promise<AccountResponseDto> {
    return accountApi.get();
  }

  async getDay(): Promise<DayPreferences> {
    const account = await this.account();
    const pendingTimezone = pendingValue(account.pendingTimezone, account.timezone);
    const pendingIntensityMode = pendingValue(account.pendingIntensityMode, account.intensityMode);
    return {
      wakeTime: toClock(account.scheduleStartMin),
      sleepTime: toClock(account.scheduleEndMin),
      timezone: account.timezone,
      pendingTimezone,
      intensity: INTENSITY_LOCAL[account.intensityMode] ?? 'standard',
      pendingIntensity: pendingIntensityMode ? (INTENSITY_LOCAL[pendingIntensityMode] ?? null) : null,
      currency: account.defaultCurrency,
      currencyLocked: account.onboardingCompletedAt !== null && account.onboardingCompletedAt !== undefined,
      monthlyBudgetMinor: account.monthlyBudgetMinor ?? null,
    };
  }

  async getOnboarding(): Promise<OnboardingStatus> {
    const account = await this.account();
    return { completed: account.onboardingCompletedAt !== null && account.onboardingCompletedAt !== undefined };
  }

  async getNotifications(): Promise<NotificationSettings> {
    const account = await this.account();
    return { preferences: NOTIFICATION_SEEDS.map(seed => ({ ...seed, email: account.notificationPrefs[seed.id] })) };
  }

  async getBilling(): Promise<BillingView> {
    const entitlement = projectEntitlement(this.sync.domains());
    const paid = entitlement.tier === 'paid';
    const lapsed = entitlement.state === 'lapsed';
    const until = entitlement.expiresAt ? ` until ${formatLocalDate(entitlement.expiresAt)}` : '';
    const endedOn = entitlement.expiresAt ? ` on ${formatLocalDate(entitlement.expiresAt)}` : '';

    const status = paid ? `Coach · ${formatEnum(entitlement.state, BILLING_STATE_LABELS)}${until}` : lapsed ? `Coach ended${endedOn}` : 'Free';

    return {
      plans: billingPlans(paid ? 'coach' : 'free'),
      status,
      lapsed,
      quotaLine: paid ? 'A daily allowance, reset at your local midnight.' : 'Two coaching requests a month, reset on the first.',
      trialLine: entitlement.trialUsed ? 'The trial has been used on this account.' : '',
      invoicesLine: BILLING_INVOICES_LINE,
      manageNote: BILLING_MANAGE_NOTE,
    };
  }

  async getExport(retried = false): Promise<ExportView> {
    const sets = projectRecordCounts(this.sync.domains());
    const jobId = await this.sync.store.readMeta<string>(SYNC_META_KEYS.exportJobId);
    if (!jobId) return { sets, job: exportJobCopy('idle', null), notice: this.expiredExportNotice };

    try {
      const job = await accountApi.exportStatus(jobId);
      const stage = EXPORT_STAGES[job.status];
      const copy = exportJobCopy(stage, job.downloadUrl ?? null);
      this.expiredExportNotice = null;
      return { sets, job: { ...copy, when: exportStageWhen(stage, job) }, notice: null };
    } catch (error) {
      if (errorCode(error) !== 'EXP_001') throw error;
      const stillCurrent = (await this.sync.store.readMeta<string>(SYNC_META_KEYS.exportJobId)) === jobId;
      if (!stillCurrent) return retried ? { sets, job: exportJobCopy('idle', null), notice: this.expiredExportNotice } : this.getExport(true);
      await this.sync.store.writeMeta(SYNC_META_KEYS.exportJobId, null);
      this.expiredExportNotice = EXPORT_EXPIRED_NOTICE;
      return { sets, job: exportJobCopy('idle', null), notice: this.expiredExportNotice };
    }
  }

  getDeletion(): Promise<DeletionView> {
    return this.deletion.view();
  }

  /** The count is the rows themselves, never the snapshot's, so the number and the list can't disagree. Net-state changes refetch this through `SyncEngineProvider`. */
  async getAppSync(): Promise<AppSyncView> {
    const snapshot = this.sync.getSnapshot();
    const status = snapshot.state;
    const pending = await this.sync.outbox.pending();
    const sending = new Set(snapshot.sending);
    const queue: QueueEntry[] = pending.map((entry, index) => ({
      id: entry.commandId,
      state: sending.has(entry.commandId) ? 'sent' : 'queued',
      text: commandLabel(entry.command.type),
      meta: `Created ${formatLocalTime(entry.createdAt)} · position ${index + 1}`,
      retryable: false,
    }));
    const failed: FailedChange[] = [...(await this.sync.outbox.deadLetters())].reverse().map(letter => ({
      id: letter.commandId,
      text: commandLabel(letter.command.type),
      reason: failureCopy(letter.code),
      meta: `Made ${formatLocalDate(letter.createdAt)} at ${formatLocalTime(letter.createdAt)}`,
      journalText: letter.command.type === 'journal.save' ? letter.command.draft.text : null,
    }));

    return {
      status,
      ...SYNC_COPY[status],
      queuedCount: queue.length,
      lastSyncedAt: snapshot.lastSyncedAt,
      queue,
      failed,
      devices: await this.devices(),
      offlineCapabilities: OFFLINE_CAPABILITIES,
      onlineOnly: ONLINE_ONLY_NOTE,
      sessionNote: SESSION_NOTE,
    };
  }

  private async currentDeviceId(): Promise<string | undefined> {
    return this.sync.store.readMeta<string>(SYNC_META_KEYS.deviceId);
  }

  private async devices(): Promise<AccountDevice[]> {
    const currentId = await this.currentDeviceId();
    return (this.sync.domains().devices ?? []).map(row => ({
      id: String(row['id']),
      name: deviceLabel(typeof row['userAgent'] === 'string' ? row['userAgent'] : null),
      meta: lastSeen(row['lastSeenAt']),
      current: String(row['id']) === currentId,
    }));
  }

  async dispatchCommand(command: AccountCommand): Promise<SettledCommandResult> {
    switch (command.type) {
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
          return commandRefusal(error, 'That could not be saved.');
        }

      case 'notification.set':
        return this.setEmail(command.preferenceId, command.enabled);

      case 'device.remove':
        try {
          await accountApi.removeDevice(command.deviceId);
          void this.sync.sync({ fresh: true });
          return applied(DEVICE_REMOVED);
        } catch (error) {
          return commandRefusal(error, 'That device could not be removed.');
        }

      case 'failedChange.dismiss':
        return this.dismissFailedChange(command.commandId);

      case 'billing.checkout':
        return this.startCheckout(command.plan);

      case 'export.prepare':
        return this.prepareExport();

      case 'export.dismiss':
        await this.sync.store.writeMeta(SYNC_META_KEYS.exportJobId, null);
        this.expiredExportNotice = null;
        return applied('');

      case 'deletion.acknowledge':
      case 'deletion.continue':
      case 'deletion.begin':
      case 'deletion.abandon':
        return this.deletion.dispatch(command);
    }
  }

  private async dismissFailedChange(commandId: string): Promise<SettledCommandResult> {
    try {
      await this.sync.outbox.dismissDeadLetter(commandId);
      return applied('');
    } catch (error) {
      if (!(error instanceof AccountBoundaryError)) throw error;
      return { status: 'applied', message: '', xpAwarded: 0, coinsAwarded: 0, delivery: { status: 'refused', boundary: error.boundary } };
    }
  }

  private async patchDay(patch: Extract<AccountCommand, { type: 'day.set' }>['patch']): Promise<SettledCommandResult> {
    try {
      const account = await accountApi.patch({
        ...(patch.wakeTime === undefined ? {} : { scheduleStartMin: toMinutes(patch.wakeTime) }),
        ...(patch.sleepTime === undefined ? {} : { scheduleEndMin: toMinutes(patch.sleepTime) }),
        ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
        ...(patch.intensity === undefined ? {} : { intensityMode: INTENSITY_WIRE[patch.intensity] }),
        ...(patch.monthlyBudgetMinor === undefined ? {} : { monthlyBudgetMinor: patch.monthlyBudgetMinor }),
      });
      if (patch.monthlyBudgetMinor !== undefined) void this.sync.sync({ fresh: true });
      return applied(this.dayMessage(patch, account));
    } catch (error) {
      return commandRefusal(error, 'That setting could not be saved.');
    }
  }

  private dayMessage(patch: Extract<AccountCommand, { type: 'day.set' }>['patch'], account: AccountResponseDto): string {
    if (patch.wakeTime !== undefined || patch.sleepTime !== undefined) return 'Saved. Changing your wake window never rewrites past days.';
    if (patch.timezone !== undefined) return pendingValue(account.pendingTimezone, account.timezone) ? DEFERRED_MESSAGE : '';
    if (patch.intensity !== undefined) return pendingValue(account.pendingIntensityMode, account.intensityMode) ? DEFERRED_MESSAGE : '';
    if (patch.monthlyBudgetMinor !== undefined) return patch.monthlyBudgetMinor === null ? 'Cleared. No monthly budget is set.' : 'Saved.';
    return '';
  }

  private async startCheckout(plan: BillingPeriod): Promise<SettledCommandResult> {
    try {
      const session = await accountApi.checkout({ plan });
      if (typeof window !== 'undefined') window.location.assign(session.url);
      return applied('Opening the payment provider’s checkout.');
    } catch (error) {
      return commandRefusal(error, 'Checkout could not be started.');
    }
  }

  private async prepareExport(): Promise<SettledCommandResult> {
    try {
      const job = await accountApi.requestExport();
      await this.sync.store.writeMeta(SYNC_META_KEYS.exportJobId, job.id);
      this.expiredExportNotice = null;
      return applied('Preparing your archive. You can leave this page.');
    } catch (error) {
      return commandRefusal(error, 'The export could not be started.');
    }
  }

  private async setEmail(preferenceId: Extract<AccountCommand, { type: 'notification.set' }>['preferenceId'], enabled: boolean): Promise<SettledCommandResult> {
    try {
      await accountApi.patch({ notificationPrefs: { [preferenceId]: enabled } });
      return applied(enabled ? 'On. Sent by email only.' : 'Off.');
    } catch (error) {
      return commandRefusal(error, 'That preference could not be saved.');
    }
  }
}
