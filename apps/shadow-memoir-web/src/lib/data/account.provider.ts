import {
  type AccountCommand,
  type AppSyncView,
  type BehaviourPreferences,
  type BillingPlan,
  type BillingView,
  type DayPreferences,
  type DeletionView,
  type ExportJob,
  type ExportView,
  type NotificationPreference,
  type NotificationSettings,
  type OnboardingStatus,
  type PlanId,
} from './account.types';
import { type SettledCommandResult } from './command.types';
import { type Persona } from './fixtures';

export interface AccountProvider {
  getDay(): Promise<DayPreferences>;
  getBehaviour(): Promise<BehaviourPreferences>;
  getNotifications(): Promise<NotificationSettings>;
  getBilling(): Promise<BillingView>;
  getExport(): Promise<ExportView>;
  getDeletion(): Promise<DeletionView>;
  getAppSync(): Promise<AppSyncView>;
  getOnboarding(): Promise<OnboardingStatus>;
  dispatchCommand(command: AccountCommand): Promise<SettledCommandResult>;
}

/** Every category ships off. This is a safety requirement rather than a default anyone may tune (PRD §2.11). */
export const NOTIFICATION_SEEDS: Omit<NotificationPreference, 'email'>[] = [
  { id: 'weeklyDigest', label: 'Weekly review', help: 'One email when the week is ready to close. Never about a quest you missed.' },
  { id: 'aiReadiness', label: 'Coaching result ready', help: 'When a request or the nightly summary has finished.' },
  { id: 'billingReminders', label: 'Billing reminders', help: 'Renewals, trial endings and failed payments.' },
];

export const DELETION_ACKNOWLEDGEMENTS: DeletionView['acknowledgements'] = [
  { id: 'permanent', text: 'I understand my quests, my history, my records and my experience are erased permanently and cannot be restored.' },
  { id: 'exported', text: 'I have exported anything I want to keep, or I do not want to keep any of it.' },
];

export const DELETION_ALTERNATIVES: DeletionView['alternatives'] = [
  { title: 'Pause instead', body: 'Set intensity to gentle, or deactivate every quest. Nothing is deleted and the streaks stay as records.' },
  { title: 'Export and keep the account', body: 'Take the archive now. The account can be deleted at any later time.' },
  { title: 'Turn off coaching and notifications', body: 'If it is the coaching or the reminders you want gone, both are switches rather than a deletion.' },
];

export const DELETION_GRACE_NOTE =
  'A thirty-day grace period, then permanent erasure. During the grace period nothing is deleted and you can stop it. If an erasure is interrupted it resumes on its own — you never have to start again.';

export const REAUTH_HANDOFF_COPY = {
  title: 'Confirm it is you, on your Shadow account',
  body: 'Deleting your data needs a fresh sign-in on the account itself, not in this app. Nothing is scheduled and nothing is erased until that confirmation comes back, and you can walk away from this screen at any point.',
  continueLabel: 'Continue on your Shadow account',
};

export const SYNC_COPY: Record<AppSyncView['status'], { title: string; body: string }> = {
  online: { title: 'Online and synced', body: 'Everything on this device matches the server.' },
  offline: { title: 'Offline — working from this device', body: 'Every screen still works. Insights, coaching and exports are the only things that wait for a connection.' },
  syncing: { title: 'Syncing', body: 'Sending queued changes in the order you made them.' },
  failed: { title: 'Sync did not go through', body: 'Your data is safe on this device. The next attempt is in about two minutes, or retry it now.' },
};

export const OFFLINE_CAPABILITIES = [
  'Today, quest completion and every quick log',
  'Journal, meals, weight and health entries',
  'The planning board for this week and next',
  'History for the last ninety days',
];

export const ONLINE_ONLY_NOTE = 'Insights, coaching results and exports need a connection. They are the only things that wait.';

export const SESSION_NOTE =
  'If your session ends while you are offline, everything you logged stays on the device and syncs once the platform restores it. You are never asked to re-enter anything.';

export const INSTALL_ROWS: AppSyncView['installRows'] = [
  { id: 'offline', label: 'Offline ready', help: 'Cache warmed for today, this week and the last ninety days.', action: 'Refresh the cache', overlay: null, done: false },
  { id: 'update', label: 'Update waiting', help: 'A newer version is downloaded and ready to apply.', action: 'Reload to update', overlay: 'update', done: false },
  {
    id: 'other-device',
    label: 'Install on another device',
    help: 'Open Shadow Memoir there and choose install.',
    action: 'Show what that looks like',
    overlay: 'install',
    done: false,
  },
];

export function billingPlans(current: PlanId): BillingPlan[] {
  return [
    {
      id: 'free',
      name: 'Free',
      price: '€0',
      cycle: 'always',
      tagline: 'The whole product. Quests, planning, money, journal, history and insights.',
      features: [
        { included: true, text: 'Everything except coaching volume' },
        { included: true, text: '2 coaching requests a month' },
        { included: true, text: 'Full export, whenever you want it' },
        { included: true, text: 'Identical hero mechanics' },
      ],
      current: current === 'free',
    },
    {
      id: 'coach',
      name: 'Coach',
      price: '€6',
      cycle: 'a month, or €60 a year',
      tagline: 'More machine time for questions about your own history. Nothing else changes.',
      features: [
        { included: true, text: 'A daily allowance instead of two requests a month' },
        { included: true, text: 'The nightly summary and a weekly deep read' },
        { included: true, text: 'Twelve months of context instead of three' },
        { included: false, text: 'No XP, HP, shields or cosmetics — not now, not later' },
      ],
      current: current === 'coach',
    },
  ];
}

export const BILLING_TRIAL_LINE = 'Fourteen days of Coach, with no card needed to start.';

export const BILLING_INVOICES_LINE = 'Sent by email and managed by the payment provider. Shadow Memoir never sees your card.';

export const BILLING_MANAGE_NOTE =
  'Cancelling, changing card and invoices all happen with the payment provider. Shadow Memoir has no route that can write your plan — only the provider’s webhook can, which is why nothing here pretends to.';

const EXPORT_COPY: Record<Exclude<ExportJob['stage'], 'idle'>, Omit<ExportJob, 'stage' | 'downloadUrl'>> = {
  preparing: { when: 'started a moment ago', body: 'Collecting your records. You can leave this page — the archive will be here when it is done.' },
  ready: { when: 'ready · the link expires on its own', body: 'JSON and CSV, with your journal as Markdown files.' },
  failed: { when: 'did not finish', body: 'The archive could not be assembled. Nothing was deleted or changed, and retrying is safe.' },
};

export function exportJobCopy(stage: ExportJob['stage'], downloadUrl: string | null): ExportJob {
  if (stage === 'idle') return { stage, when: '', body: '', downloadUrl: null };
  return { stage, ...EXPORT_COPY[stage], downloadUrl };
}

interface AccountFixtureState {
  persona: Persona;
  day: DayPreferences;
  behaviour: BehaviourPreferences;
  notifications: NotificationSettings;
  plan: PlanId;
  exportStage: ExportJob['stage'];
  deletionStage: DeletionView['stage'];
  acknowledged: Set<string>;
}

export interface AccountFixtureOptions {
  persona?: Persona;
  currency: string;
}

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

/**
 * The fixture account, kept for stories and component tests. Deletion deliberately has no path to
 * `scheduled`: `deletion.begin` moves to the re-authentication handoff and stops, because only the platform
 * confirming the owner can start an erasure.
 */
export function createAccountProvider({ persona = 'active', currency }: AccountFixtureOptions): AccountProvider {
  const state: AccountFixtureState = {
    persona,
    day: {
      wakeTime: '06:30',
      sleepTime: '22:30',
      timezone: 'Europe/Oslo',
      pendingTimezone: null,
      intensity: 'standard',
      pendingIntensity: null,
      currency,
      currencyLocked: persona !== 'new',
    },
    behaviour: { compactDensity: false, reduceMotion: false, dailyJournalPrompt: false, showCosmetics: true },
    notifications: {
      pushPermission: persona === 'new' ? 'default' : 'granted',
      permissionNote:
        persona === 'new'
          ? 'Push has not been asked for on this device. Turning push on is what asks.'
          : 'Push is allowed on this device. Everything below is still off until you turn it on.',
      pushOptIn: false,
      preferences: NOTIFICATION_SEEDS.map(seed => ({ ...seed, email: false })),
    },
    plan: 'free',
    exportStage: 'idle',
    deletionStage: 'idle',
    acknowledged: new Set(),
  };

  const sets = [
    { name: 'Quests', meta: '11 quests · 3,180 occurrences' },
    { name: 'Money', meta: '96 expenses · 7 subscriptions' },
    { name: 'Journal', meta: '184 entries' },
    { name: 'Body', meta: '21 weights · 68 metrics · 19 meals' },
    { name: 'Side quests', meta: '46 records' },
  ];

  return {
    getDay: () => Promise.resolve({ ...state.day }),
    getBehaviour: () => Promise.resolve({ ...state.behaviour }),
    getNotifications: () => Promise.resolve({ ...state.notifications, preferences: state.notifications.preferences.map(item => ({ ...item })) }),
    getOnboarding: () => Promise.resolve({ completed: state.persona !== 'new' }),
    getBilling: () =>
      Promise.resolve({
        plans: billingPlans(state.plan),
        status: state.plan === 'coach' ? 'Coach · active' : 'Free · no payment method on file',
        quotaLine: state.plan === 'coach' ? 'A daily allowance, reset at your local midnight' : '1 of 2 requests used this month',
        trialLine: BILLING_TRIAL_LINE,
        invoicesLine: BILLING_INVOICES_LINE,
        manageNote: BILLING_MANAGE_NOTE,
      }),
    getExport: () => Promise.resolve({ sets, job: exportJobCopy(state.exportStage, state.exportStage === 'ready' ? 'https://example.invalid/archive.zip' : null) }),
    getDeletion: () =>
      Promise.resolve({
        stage: state.deletionStage,
        stateNote: null,
        sets,
        acknowledgements: DELETION_ACKNOWLEDGEMENTS,
        acknowledged: [...state.acknowledged],
        reauth: { ...REAUTH_HANDOFF_COPY, continueTo: '/api/auth/step-up' },
        alternatives: DELETION_ALTERNATIVES,
        gracePeriodNote: DELETION_GRACE_NOTE,
      }),
    getAppSync: () => {
      const status: AppSyncView['status'] = state.persona === 'new' ? 'online' : 'offline';
      return Promise.resolve({
        status,
        ...SYNC_COPY[status],
        queuedCount: state.persona === 'new' ? 0 : 2,
        lastSyncedAt: null,
        queue:
          state.persona === 'new'
            ? []
            : [
                { id: 'q1', state: 'queued' as const, text: 'Expense €18.40 · Groceries', meta: 'Created 09:12 · position 1', retryable: false },
                { id: 'q2', state: 'queued' as const, text: 'Journal entry · 84 words', meta: 'Created 09:31 · position 2', retryable: false },
              ],
        devices:
          state.persona === 'new'
            ? []
            : [
                { id: 'd1', name: 'Chrome · MacBook', meta: 'Last seen a moment ago', current: true },
                { id: 'd2', name: 'Shadow Memoir · iPhone', meta: 'Last seen 2 August', current: false },
              ],
        installRows: INSTALL_ROWS,
        offlineCapabilities: OFFLINE_CAPABILITIES,
        onlineOnly: ONLINE_ONLY_NOTE,
        sessionNote: SESSION_NOTE,
      });
    },
    dispatchCommand: command => {
      switch (command.type) {
        case 'day.set':
          state.day = { ...state.day, ...command.patch };
          return Promise.resolve(applied('Saved. Changing your wake window never rewrites past days.'));

        case 'behaviour.set':
          state.behaviour = { ...state.behaviour, ...command.patch };
          return Promise.resolve(applied('Saved.'));

        case 'onboarding.complete':
          state.day = { ...state.day, currency: command.submission.currency, currencyLocked: true };
          state.persona = 'active';
          return Promise.resolve(applied('Set up. Your home currency is fixed from here.'));

        case 'notification.set':
          state.notifications = {
            ...state.notifications,
            preferences: state.notifications.preferences.map(item => (item.id === command.preferenceId ? { ...item, email: command.enabled } : item)),
          };
          return Promise.resolve(applied(command.enabled ? 'On.' : 'Off.'));

        case 'notification.setPush':
          state.notifications = { ...state.notifications, pushOptIn: command.enabled };
          return Promise.resolve(applied(command.enabled ? 'Push is on for this device.' : 'Push is off for this device.'));

        case 'device.remove':
          return Promise.resolve(applied('That device will stop receiving notifications.'));

        case 'billing.checkout':
          state.plan = 'coach';
          return Promise.resolve(applied('Opening the payment provider’s checkout.'));

        case 'export.prepare':
          state.exportStage = 'preparing';
          return Promise.resolve(applied('Preparing your archive. You can leave this page.'));

        case 'export.dismiss':
          state.exportStage = 'idle';
          return Promise.resolve(applied(''));

        case 'deletion.acknowledge':
          if (command.acknowledged) state.acknowledged.add(command.acknowledgementId);
          else state.acknowledged.delete(command.acknowledgementId);
          return Promise.resolve(applied(''));

        case 'deletion.begin':
          if (state.acknowledged.size < DELETION_ACKNOWLEDGEMENTS.length)
            return Promise.resolve({ status: 'rejected', message: 'Both statements need to be true before anything goes further.' });
          state.deletionStage = 'awaiting-reauth';
          return Promise.resolve(applied('Nothing is scheduled yet. The next confirmation happens on your Shadow account.'));

        default:
          state.deletionStage = 'idle';
          state.acknowledged.clear();
          return Promise.resolve(applied('Stopped. Nothing was scheduled and nothing was deleted.'));
      }
    },
  };
}
