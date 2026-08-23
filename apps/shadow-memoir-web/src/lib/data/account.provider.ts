import {
  type AccountCommand,
  type AppSyncView,
  type BehaviourPreferences,
  type BillingView,
  type DayPreferences,
  type DeletionView,
  type ExportJob,
  type ExportView,
  type NotificationSettings,
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
  dispatchCommand(command: AccountCommand): Promise<SettledCommandResult>;
}

/** Every category ships off. This is a safety requirement rather than a default anyone may tune (PRD §2.11). */
const NOTIFICATION_SEEDS: { id: string; label: string; help: string }[] = [
  { id: 'quest-reminders', label: 'Quest reminders', help: 'Only inside your wake window, and never about a quest you missed.' },
  { id: 'ai-result', label: 'Coaching result ready', help: 'When a request or the nightly summary is finished.' },
  { id: 'weekly-review', label: 'Weekly review', help: 'One reminder that the week is ready to close, on a day and time you pick.' },
  { id: 'billing', label: 'Billing reminders', help: 'Renewals, trial endings and failed payments.' },
  { id: 'crown-closing', label: 'Crown period closing', help: 'Two days before a period ends.' },
  { id: 'product-updates', label: 'Product updates', help: 'Rare, and never about your data.' },
];

const EXPORT_SETS: ExportView['sets'] = [
  { name: 'Quests', meta: '11 quests · 3,180 occurrences' },
  { name: 'Money', meta: '96 expenses · 7 subscriptions' },
  { name: 'Journal', meta: '184 entries · Markdown' },
  { name: 'Body', meta: '21 weights · 68 metrics · 19 meals' },
  { name: 'Hero', meta: 'The XP log, achievements and titles' },
  { name: 'Side quests', meta: '46 records' },
];

const EXPORT_COPY: Record<Exclude<ExportJob['stage'], 'idle'>, Omit<ExportJob, 'stage'>> = {
  preparing: {
    when: 'started a moment ago',
    body: 'Collecting 1,284 records. You can leave this page — the archive will be here when it is done.',
    progressPercent: 64,
  },
  ready: {
    when: 'ready · the link lasts seven days',
    body: 'shadow-memoir-export.zip · 3.4 MB · JSON and CSV, with your journal as Markdown files.',
    progressPercent: null,
  },
  failed: {
    when: 'failed after forty seconds',
    body: 'The archive could not be finished. Nothing was deleted or changed, and retrying is safe.',
    progressPercent: null,
  },
};

const DELETION_SETS: DeletionView['sets'] = [
  { name: 'Quests and history', meta: '11 quests · 3,180 occurrences' },
  { name: 'Hero and progression', meta: '24,180 XP · 6 achievements · 6 titles' },
  { name: 'Money', meta: '96 expenses · 7 subscriptions' },
  { name: 'Journal', meta: '184 entries' },
  { name: 'Body and health', meta: '108 entries' },
  { name: 'Coaching results', meta: '14 results and the inputs they read' },
];

const ACKNOWLEDGEMENTS: DeletionView['acknowledgements'] = [
  { id: 'permanent', text: 'I understand my quests, 214 days of history, 1,284 records and 24,180 XP are erased permanently and cannot be restored.' },
  { id: 'exported', text: 'I have exported anything I want to keep, or I do not want to keep any of it.' },
];

const SYNC_COPY: Record<AppSyncView['status'], { title: string; body: string }> = {
  online: { title: 'Online and synced', body: 'Everything on this device matches the server.' },
  offline: { title: 'Offline — working from this device', body: 'Every screen still works. Insights, coaching and exports are the only things that wait for a connection.' },
  syncing: { title: 'Syncing', body: 'Sending queued changes in the order you made them.' },
  failed: { title: 'Sync did not go through', body: 'Your data is safe on this device. The next attempt is in about two minutes, or retry it now.' },
};

interface AccountFixtureState {
  persona: Persona;
  heroName: string;
  day: DayPreferences;
  behaviour: BehaviourPreferences;
  notifications: NotificationSettings;
  plan: 'free' | 'coach';
  cancelling: boolean;
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

function plans(state: AccountFixtureState): BillingView['plans'] {
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
      current: state.plan === 'free',
    },
    {
      id: 'coach',
      name: 'Coach',
      price: '€6',
      cycle: 'a month, or €60 a year',
      tagline: 'More machine time for questions about your own history. Nothing else changes.',
      features: [
        { included: true, text: '60 coaching requests a month' },
        { included: true, text: 'The nightly summary and a weekly deep read' },
        { included: true, text: 'Twelve months of context instead of three' },
        { included: false, text: 'No XP, HP, shields or cosmetics — not now, not later' },
      ],
      current: state.plan === 'coach',
    },
  ];
}

/**
 * The fixture account. Deletion deliberately has no path to `scheduled`: `deletion.begin` moves to the
 * re-authentication handoff and stops, because only the platform confirming the owner can schedule an erasure.
 */
export function createAccountProvider({ persona = 'active', currency }: AccountFixtureOptions): AccountProvider {
  const state: AccountFixtureState = {
    persona,
    heroName: persona === 'new' ? '' : 'Rune',
    day: { wakeTime: '06:30', sleepTime: '22:30', timezone: 'Europe/Oslo', currency, currencyLocked: persona !== 'new' },
    behaviour: { compactDensity: false, reduceMotion: false, dailyJournalPrompt: false, showCosmetics: true },
    notifications: {
      pushPermission: persona === 'new' ? 'default' : 'granted',
      permissionNote:
        persona === 'new'
          ? 'Push has not been asked for on this device. Turning on a category below is what asks.'
          : 'Push is allowed on this device. Everything below is still off until you turn it on.',
      preferences: NOTIFICATION_SEEDS.map(seed => ({ ...seed, push: false, email: false })),
      devices:
        persona === 'new'
          ? []
          : [
              { id: 'd1', name: 'Chrome · MacBook', meta: 'Subscribed 14 August', current: true },
              { id: 'd2', name: 'Shadow Memoir · iPhone', meta: 'Installed app · subscribed 2 August', current: false },
              { id: 'd3', name: 'Firefox · desktop', meta: 'Last seen 4 August', current: false },
            ],
    },
    plan: 'free',
    cancelling: false,
    exportStage: 'idle',
    deletionStage: 'idle',
    acknowledged: new Set(),
  };

  const billing = (): BillingView => ({
    plans: plans(state),
    status: state.plan === 'coach' ? 'Coach · active · renews 23 September' : 'Free · no payment method on file',
    quotaLine: state.plan === 'coach' ? '2 of 60 requests used this month' : '1 of 2 requests used this month',
    trialLine: 'Fourteen days of Coach, with no card needed to start.',
    invoicesLine: 'Sent by email and managed by the payment provider. Shadow Memoir never sees your card.',
    cancellationNote: state.cancelling
      ? 'Coach stays active until 23 September, then the plan returns to Free with two requests a month. Your quests, XP, streaks, history and exports are untouched — paying has never affected hero mechanics.'
      : null,
  });

  const deletion = (): DeletionView => ({
    stage: state.deletionStage,
    scheduledFor: null,
    sets: DELETION_SETS,
    acknowledgements: ACKNOWLEDGEMENTS,
    acknowledged: [...state.acknowledged],
    reauth: {
      title: 'Confirm it is you, on your Shadow account',
      body: 'Deleting your data needs a fresh sign-in on the account itself, not in this app. Nothing is scheduled and nothing is erased until that confirmation comes back, and you can walk away from this screen at any point.',
      continueLabel: 'Continue on your Shadow account',
      continueTo: '/settings',
    },
    alternatives: [
      { title: 'Pause instead', body: 'Set intensity to gentle, or deactivate every quest. Nothing is deleted and the streaks stay as records.' },
      { title: 'Export and keep the account', body: 'Take the archive now. The account can be deleted at any later time.' },
      { title: 'Turn off coaching and notifications', body: 'If it is the coaching or the reminders you want gone, both are switches rather than a deletion.' },
    ],
    gracePeriodNote:
      'A thirty-day grace period, then permanent erasure. During the grace period nothing is deleted and you can stop it. If an erasure is interrupted it resumes on its own — you never have to start again.',
  });

  const appSync = (): AppSyncView => {
    const status: AppSyncView['status'] = state.persona === 'new' ? 'online' : 'offline';
    return {
      status,
      ...SYNC_COPY[status],
      queuedCount: state.persona === 'new' ? 0 : 2,
      lastSyncedMinutes: 9,
      cacheMegabytes: 4.2,
      conflictCount: state.persona === 'new' ? 0 : 1,
      queue:
        state.persona === 'new'
          ? []
          : [
              { id: 'q1', state: 'queued', text: 'Expense €18.40 · Groceries', meta: 'Created 09:12 · position 1', retryable: false },
              { id: 'q2', state: 'queued', text: 'Journal entry · 84 words', meta: 'Created 09:31 · position 2', retryable: false },
              { id: 'q3', state: 'sent', text: 'Quest completion · Morning run', meta: 'Synced 07:41', retryable: false },
              { id: 'q4', state: 'conflict', text: 'Weight 78.4 kg · two versions today', meta: 'Needs one decision from you', retryable: false },
              { id: 'q5', state: 'sent', text: 'Steps 8,310', meta: 'Synced 19:03', retryable: false },
            ],
      installRows: [
        { id: 'installed', label: 'Installed', help: 'Added to your home screen on 2 August.', action: 'Installed', overlay: null, done: true },
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
      ],
      offlineCapabilities: [
        'Today, quest completion and every quick log',
        'Journal, meals, weight and health entries',
        'The planning board for this week and next',
        'History for the last ninety days',
      ],
      onlineOnly: 'Insights, coaching results and exports need a connection. They are the only things that wait.',
      sessionNote:
        'If your session ends while you are offline, everything you logged stays on the device and syncs once the platform restores it. You are never asked to re-enter anything.',
    };
  };

  return {
    getDay: () => Promise.resolve({ ...state.day }),
    getBehaviour: () => Promise.resolve({ ...state.behaviour }),
    getNotifications: () => Promise.resolve({ ...state.notifications, preferences: state.notifications.preferences.map(item => ({ ...item })) }),
    getBilling: () => Promise.resolve(billing()),
    getExport: () =>
      Promise.resolve({
        sets: EXPORT_SETS,
        job: state.exportStage === 'idle' ? { stage: 'idle', when: '', body: '', progressPercent: null } : { stage: state.exportStage, ...EXPORT_COPY[state.exportStage] },
        past: [
          { id: 'p1', date: '2 August 2026', meta: 'JSON and CSV · 3.1 MB', expired: false },
          { id: 'p2', date: '4 July 2026', meta: 'CSV only · 900 KB', expired: true },
          { id: 'p3', date: '21 January 2026', meta: 'Markdown journal · 240 KB', expired: true },
        ],
      }),
    getDeletion: () => Promise.resolve(deletion()),
    getAppSync: () => Promise.resolve(appSync()),
    dispatchCommand: command => {
      switch (command.type) {
        case 'profile.setHeroName':
          state.heroName = command.heroName;
          return Promise.resolve(applied('Hero name saved. It appears on your Hero screen and nowhere else.'));

        case 'day.set':
          if (command.patch.currency !== undefined && state.day.currencyLocked)
            return Promise.resolve({
              status: 'rejected',
              message: 'Your home currency was set when you started and stays fixed. Expenses in another currency keep their own and convert to this one.',
            });
          state.day = { ...state.day, ...command.patch };
          return Promise.resolve(applied('Saved. Changing your wake window never rewrites past days.'));

        case 'behaviour.set':
          state.behaviour = { ...state.behaviour, ...command.patch };
          return Promise.resolve(applied('Saved.'));

        case 'notification.set': {
          state.notifications = {
            ...state.notifications,
            preferences: state.notifications.preferences.map(item => (item.id === command.preferenceId ? { ...item, [command.channel]: command.enabled } : item)),
          };
          return Promise.resolve(applied(command.enabled ? 'On. It is sent only inside your wake window.' : 'Off.'));
        }

        case 'notification.removeDevice':
          state.notifications = { ...state.notifications, devices: state.notifications.devices.filter(device => device.id !== command.deviceId) };
          return Promise.resolve(applied('That device will stop receiving notifications.'));

        case 'billing.startTrial':
          state.plan = 'coach';
          state.cancelling = false;
          return Promise.resolve(applied('Coach is active. Your hero, XP, streaks and quests are exactly as they were.'));

        case 'billing.cancel':
          state.cancelling = true;
          return Promise.resolve(applied('Cancelled at the end of the period. Nothing about the game changes.'));

        case 'export.prepare':
          state.exportStage = 'preparing';
          return Promise.resolve(applied('Preparing your archive. You can leave this page.'));

        case 'export.cancel':
          state.exportStage = 'idle';
          return Promise.resolve(applied('Stopped. Nothing was changed or deleted.'));

        case 'deletion.acknowledge':
          if (command.acknowledged) state.acknowledged.add(command.acknowledgementId);
          else state.acknowledged.delete(command.acknowledgementId);
          return Promise.resolve(applied(''));

        case 'deletion.begin':
          if (state.acknowledged.size < ACKNOWLEDGEMENTS.length)
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
