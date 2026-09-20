import { type HeroIntensityMode } from './hero.types';

export interface DayPreferences {
  wakeTime: string;
  sleepTime: string;
  timezone: string;
  /** Staged by the server and applied at the next daily rollover, so a mid-day change never rewrites the day in progress. */
  pendingTimezone: string | null;
  intensity: HeroIntensityMode;
  pendingIntensity: HeroIntensityMode | null;
  currency: string;
  /** Set once during onboarding and read-only afterwards — past expenses keep the currency they were logged in. */
  currencyLocked: boolean;
  /** Minor units of `currency`; `null` when no budget is set. */
  monthlyBudgetMinor: number | null;
}

/** The three email categories the account row carries. Push is not modelled here yet. */
type NotificationPrefKey = 'weeklyDigest' | 'aiReadiness' | 'billingReminders';

export interface NotificationPreference {
  id: NotificationPrefKey;
  label: string;
  help: string;
  email: boolean;
}

export interface NotificationSettings {
  preferences: NotificationPreference[];
}

export interface AccountDevice {
  id: string;
  name: string;
  meta: string;
  current: boolean;
}

export type PlanId = 'free' | 'coach';

export type BillingPeriod = 'monthly' | 'yearly';

export interface BillingPlan {
  id: PlanId;
  name: string;
  price: string;
  cycle: string;
  tagline: string;
  features: { included: boolean; text: string }[];
  current: boolean;
}

export interface BillingView {
  plans: BillingPlan[];
  status: string;
  /** Coach has ended and the account is back on Free; checkout is offered as a renewal rather than a first purchase. */
  lapsed: boolean;
  quotaLine: string;
  trialLine: string;
  invoicesLine: string;
  /** Cancellation and invoices live with the payment provider; Memoir has no route that writes an entitlement. */
  manageNote: string;
}

export type ExportStage = 'idle' | 'preparing' | 'ready' | 'failed';

export interface ExportJob {
  stage: ExportStage;
  when: string;
  body: string;
  downloadUrl: string | null;
}

export interface ExportView {
  sets: { name: string; meta: string }[];
  job: ExportJob;
  notice: string | null;
}

/** `unknown` is an erasure this session may not read the progress of: the status route needs an elevated session. */
export type DeletionProgress = 'pending' | 'blobs_deleted' | 'data_deleted' | 'identity_closed' | 'done' | 'unknown';

/**
 * The server starts an erasure the moment it is asked, with no grace period and no way to stop it, so `confirm` is the only stage an
 * erasure can start from: an elevated session whose owner has acknowledged both statements and asked to continue.
 */
export type DeletionStage =
  | { kind: 'idle' }
  | { kind: 'awaiting-reauth'; reason: 'step-up' | 'expired' }
  | { kind: 'confirm' }
  | { kind: 'unconfirmed'; reason: 'unreachable' | 'signed-out' }
  | { kind: 'underway'; progress: DeletionProgress; startedAt: string | null };

export type ErasureDevice = 'removed' | 'kept';

interface DeletionAcknowledgement {
  id: string;
  text: string;
}

interface ReauthHandoff {
  title: string;
  body: string;
  continueLabel: string;
  /** A full-page navigation into the identity step-up prompt, not a router destination. */
  continueTo: string;
}

interface DeletionAlternative {
  title: string;
  body: string;
  links: { label: string; to: string }[];
}

export interface DeletionView {
  stage: DeletionStage;
  sets: { name: string; meta: string }[];
  acknowledgements: DeletionAcknowledgement[];
  acknowledged: string[];
  reauth: ReauthHandoff;
  alternatives: DeletionAlternative[];
  terms: string;
}

type SyncStatus = 'online' | 'offline' | 'syncing' | 'failed' | 'signed-out';

type QueueEntryState = 'queued' | 'sent' | 'retrying' | 'conflict';

export interface QueueEntry {
  id: string;
  state: QueueEntryState;
  text: string;
  meta: string;
  retryable: boolean;
}

interface InstallRowAction {
  label: string;
  overlay: 'install-preview' | 'update';
}

export interface InstallRow {
  id: 'offline' | 'update' | 'other-device';
  label: string;
  help: string;
  action: InstallRowAction | null;
}

/** A change the server failed in a way no resend can fix, so it left the queue. */
export interface FailedChange {
  id: string;
  text: string;
  reason: string;
  meta: string;
  /** What the owner wrote, when the failed change is a journal entry — the server never kept it. */
  journalText: string | null;
}

export interface AppSyncView {
  status: SyncStatus;
  title: string;
  body: string;
  queuedCount: number;
  lastSyncedAt: string | null;
  queue: QueueEntry[];
  failed: FailedChange[];
  devices: AccountDevice[];
  offlineCapabilities: string[];
  onlineOnly: string;
  sessionNote: string;
}

export interface OnboardingStatus {
  completed: boolean;
}

interface OnboardingSubmission {
  currency: string;
  timezone: string;
  wakeTime: string;
  sleepTime: string;
}

export type AccountCommand =
  | { type: 'day.set'; patch: Partial<Pick<DayPreferences, 'wakeTime' | 'sleepTime' | 'timezone' | 'intensity' | 'monthlyBudgetMinor'>> }
  | { type: 'onboarding.complete'; submission: OnboardingSubmission }
  | { type: 'notification.set'; preferenceId: NotificationPrefKey; enabled: boolean }
  | { type: 'device.remove'; deviceId: string }
  | { type: 'failedChange.dismiss'; commandId: string }
  | { type: 'billing.checkout'; plan: BillingPeriod }
  | { type: 'export.prepare' }
  | { type: 'export.dismiss' }
  | { type: 'deletion.acknowledge'; acknowledgementId: string; acknowledged: boolean }
  | { type: 'deletion.continue' }
  | { type: 'deletion.begin' }
  | { type: 'deletion.abandon' };
