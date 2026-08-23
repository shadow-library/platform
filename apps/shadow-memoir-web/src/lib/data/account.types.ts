export interface AccountProfile {
  displayName: string;
  email: string;
  heroName: string;
  displayedTitleId: string | null;
}

export interface DayPreferences {
  wakeTime: string;
  sleepTime: string;
  timezone: string;
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

export type NotificationChannel = 'push' | 'email';

export interface NotificationPreference {
  id: string;
  label: string;
  help: string;
  push: boolean;
  email: boolean;
}

export interface PushDevice {
  id: string;
  name: string;
  meta: string;
  current: boolean;
}

export interface NotificationSettings {
  pushPermission: 'granted' | 'default' | 'denied';
  permissionNote: string;
  preferences: NotificationPreference[];
  devices: PushDevice[];
}

export type PlanId = 'free' | 'coach';

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
  /** Set once a cancellation has been started; the plan runs to the end of the paid period. */
  cancellationNote: string | null;
}

export type ExportFormat = 'json-csv' | 'csv' | 'markdown';

export type ExportStage = 'idle' | 'preparing' | 'ready' | 'failed';

export interface ExportJob {
  stage: ExportStage;
  when: string;
  body: string;
  progressPercent: number | null;
}

export interface PastExport {
  id: string;
  date: string;
  meta: string;
  expired: boolean;
}

export interface ExportView {
  sets: { name: string; meta: string }[];
  job: ExportJob;
  past: PastExport[];
}

/**
 * Deletion never reaches `scheduled` from inside the app: the elevated re-authentication happens on the
 * Shadow account, and only its confirmation can schedule anything (PRD §2.10).
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
  continueTo: string;
}

export interface DeletionView {
  stage: DeletionStage;
  scheduledFor: string | null;
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
  lastSyncedMinutes: number;
  cacheMegabytes: number;
  conflictCount: number;
  queue: QueueEntry[];
  installRows: InstallRow[];
  offlineCapabilities: string[];
  onlineOnly: string;
  sessionNote: string;
}

export type AccountCommand =
  | { type: 'profile.setHeroName'; heroName: string }
  | { type: 'day.set'; patch: Partial<Omit<DayPreferences, 'currencyLocked'>> }
  | { type: 'behaviour.set'; patch: Partial<BehaviourPreferences> }
  | { type: 'notification.set'; preferenceId: string; channel: NotificationChannel; enabled: boolean }
  | { type: 'notification.removeDevice'; deviceId: string }
  | { type: 'billing.startTrial' }
  | { type: 'billing.cancel' }
  | { type: 'export.prepare'; format: ExportFormat }
  | { type: 'export.cancel' }
  | { type: 'deletion.acknowledge'; acknowledgementId: string; acknowledged: boolean }
  | { type: 'deletion.begin' }
  | { type: 'deletion.abandon' };
