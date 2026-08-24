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
}

export interface BehaviourPreferences {
  compactDensity: boolean;
  reduceMotion: boolean;
  dailyJournalPrompt: boolean;
  showCosmetics: boolean;
}

/** The three email categories the account row carries. Push is not per-category — it is one opt-in per registered device. */
export type NotificationPrefKey = 'weeklyDigest' | 'aiReadiness' | 'billingReminders';

export interface NotificationPreference {
  id: NotificationPrefKey;
  label: string;
  help: string;
  email: boolean;
}

export interface NotificationSettings {
  pushPermission: 'granted' | 'default' | 'denied';
  permissionNote: string;
  pushOptIn: boolean;
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
  quotaLine: string;
  trialLine: string;
  invoicesLine: string;
  /** Cancellation and invoices live with the payment provider; Shadow Memoir has no route that writes an entitlement. */
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
}

/**
 * Deletion never reaches `scheduled` from inside the app: the elevated re-authentication happens on the
 * Shadow account, and only its confirmation can start anything (PRD §2.10).
 */
export type DeletionStage = 'idle' | 'awaiting-reauth' | 'scheduled';

export interface DeletionAcknowledgement {
  id: string;
  text: string;
}

export interface ReauthHandoff {
  title: string;
  body: string;
  continueLabel: string;
  /** A full-page navigation into the identity step-up prompt, not a router destination. */
  continueTo: string;
}

export interface DeletionView {
  stage: DeletionStage;
  stateNote: string | null;
  sets: { name: string; meta: string }[];
  acknowledgements: DeletionAcknowledgement[];
  acknowledged: string[];
  reauth: ReauthHandoff;
  alternatives: { title: string; body: string }[];
  gracePeriodNote: string;
}

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'failed';

export type QueueEntryState = 'queued' | 'sent' | 'retrying' | 'conflict';

export interface QueueEntry {
  id: string;
  state: QueueEntryState;
  text: string;
  meta: string;
  retryable: boolean;
}

export interface InstallRow {
  id: string;
  label: string;
  help: string;
  action: string;
  overlay: 'install' | 'update' | null;
  done: boolean;
}

export interface AppSyncView {
  status: SyncStatus;
  title: string;
  body: string;
  queuedCount: number;
  lastSyncedAt: string | null;
  queue: QueueEntry[];
  devices: AccountDevice[];
  installRows: InstallRow[];
  offlineCapabilities: string[];
  onlineOnly: string;
  sessionNote: string;
}

export interface OnboardingStatus {
  completed: boolean;
}

export interface OnboardingSubmission {
  currency: string;
  timezone: string;
  wakeTime: string;
  sleepTime: string;
}

export type AccountCommand =
  | { type: 'day.set'; patch: Partial<Pick<DayPreferences, 'wakeTime' | 'sleepTime' | 'timezone' | 'intensity'>> }
  | { type: 'behaviour.set'; patch: Partial<BehaviourPreferences> }
  | { type: 'onboarding.complete'; submission: OnboardingSubmission }
  | { type: 'notification.set'; preferenceId: NotificationPrefKey; enabled: boolean }
  | { type: 'notification.setPush'; enabled: boolean }
  | { type: 'device.remove'; deviceId: string }
  | { type: 'billing.checkout'; plan: BillingPeriod }
  | { type: 'export.prepare' }
  | { type: 'export.dismiss' }
  | { type: 'deletion.acknowledge'; acknowledgementId: string; acknowledged: boolean }
  | { type: 'deletion.begin' }
  | { type: 'deletion.abandon' };
