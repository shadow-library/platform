import { type CommandEnvelopeDto, type SyncCommandOutcomeDto, type SyncDeltaResponseDto } from '@/lib/apis/api-types.gen';
import { type Command, type FinanceCommand, type HeroCommand, type QuickLogCommand } from '@/lib/data';

/** The delta domains shadow-memoir-server registers today. Each flips from fixture-backed to live independently. */
export type SyncDomain =
  | 'quests'
  | 'quest_logs'
  | 'daily_states'
  | 'quest_streaks'
  | 'account'
  | 'devices'
  | 'expenses'
  | 'expense_categories'
  | 'expense_audits'
  | 'subscriptions'
  | 'journal_entries'
  | 'meals'
  | 'meal_presets'
  | 'weights'
  | 'side_quests'
  | 'metrics'
  | 'metric_entries'
  | 'health_offers'
  | 'achievements_earned'
  | 'titles_earned'
  | 'cosmetic_unlocks'
  | 'progress_counters'
  | 'hero_events'
  | 'entitlement'
  | 'ai_tasks'
  | 'ai_results'
  | 'ai_scheduled_queries'
  | 'ai_consents';

export const SYNC_DOMAINS: SyncDomain[] = [
  'quests',
  'quest_logs',
  'daily_states',
  'quest_streaks',
  'account',
  'devices',
  'expenses',
  'expense_categories',
  'expense_audits',
  'subscriptions',
  'journal_entries',
  'meals',
  'meal_presets',
  'weights',
  'side_quests',
  'metrics',
  'metric_entries',
  'health_offers',
  'achievements_earned',
  'titles_earned',
  'cosmetic_unlocks',
  'progress_counters',
  'hero_events',
  'entitlement',
  'ai_tasks',
  'ai_results',
  'ai_scheduled_queries',
  'ai_consents',
];

/** Domains a server released before them refuses; one that refuses without naming the domain loses all of these for the session. */
export const NEWER_DOMAINS: SyncDomain[] = ['progress_counters', 'hero_events', 'expense_audits'];

/**
 * The keyset domains a mirror pulled before coverage was recorded already holds, at row version 1. Every later
 * domain, and every version bump below, is backfilled from zero on its own rather than trusted to a cursor that
 * may already have passed its rows.
 */
export const PRE_COVERAGE_KEYSET_DOMAINS: SyncDomain[] = [
  'quests',
  'quest_logs',
  'daily_states',
  'quest_streaks',
  'expenses',
  'subscriptions',
  'journal_entries',
  'meals',
  'weights',
  'side_quests',
  'metric_entries',
  'ai_tasks',
  'ai_results',
  'ai_scheduled_queries',
  'ai_consents',
];

/** Bumped when the server adds a field to a keyset domain's rows, so rows mirrored before it are pulled again. */
export const KEYSET_ROW_VERSIONS: Partial<Record<SyncDomain, number>> = { quest_logs: 2 };

export function coverageKey(domain: SyncDomain): string {
  return `${domain}@${KEYSET_ROW_VERSIONS[domain] ?? 1}`;
}

/** Domains the server answers with the authoritative full set rather than a watermark — the local set is replaced, never merged. */
export const SNAPSHOT_DOMAINS: SyncDomain[] = [
  'account',
  'devices',
  'expense_categories',
  'meal_presets',
  'metrics',
  'health_offers',
  'achievements_earned',
  'titles_earned',
  'cosmetic_unlocks',
  'progress_counters',
  'entitlement',
];

/** Every command shape the outbox carries. The quest union is the `DataProvider`'s; the other three belong to their own providers. */
export type SyncCommand = Command | FinanceCommand | QuickLogCommand | HeroCommand;

export type DeltaRow = Record<string, unknown>;

/** The generated contract, with `domains` narrowed from the schema's free-form object to the rows it actually carries. */
export type DeltaPage = Omit<SyncDeltaResponseDto, 'domains'> & { domains: Record<string, DeltaRow[]> };

export interface DeltaResponse {
  page: DeltaPage;
  epoch: string | null;
}

export type CommandEnvelope = CommandEnvelopeDto;

type CommandOutcomeStatus = 'applied' | 'rejected' | 'superseded' | 'failed';

/** `status` is `string` in the schema because the server assembles it from two sources; the client only ever sees these four. */
export type WireCommandOutcome = Omit<SyncCommandOutcomeDto, 'status'> & { status: CommandOutcomeStatus };

export interface CommandBatchResponse {
  outcomes: WireCommandOutcome[];
  epoch: string | null;
}

/**
 * A queued command envelope. `seq` is a local monotonic counter rather than `createdAt`: two commands
 * minted in the same millisecond must still replay in the order the owner performed them. `command` is the
 * local form, kept so a fresh delta projection can be brought back up to the state the owner is looking at
 * by replaying what is still queued.
 */
export interface OutboxEntry extends CommandEnvelope {
  seq: number;
  createdAt: string;
  command: SyncCommand;
}

export type NetState = 'online' | 'offline' | 'syncing' | 'failed' | 'signed-out';

export type SyncFailureReason = 'server' | 'offline' | 'deletion-pending' | 'signed-out';

/** Whether this device holds a pulled mirror for the account: `loading` and `failed` mean an empty mirror is not an empty account. */
export type SyncReadiness = { kind: 'loading' } | { kind: 'failed'; reason: SyncFailureReason } | { kind: 'ready' };

export type SyncNoticeOutcome = 'rejected' | 'superseded' | 'failed';

/**
 * A command whose outcome nobody on screen is waiting for — replayed after a reload, released by a screen that
 * went away, or answered after its screen stopped waiting. Surfaced once, then dropped; the outbox never holds it.
 */
export interface SyncNotice {
  commandId: string;
  commandType: SyncCommand['type'];
  outcome: SyncNoticeOutcome;
  code: string | null;
}

/** A command the server failed in a way no resend can change. It leaves the queue so the commands behind it can go, and is kept here so it is never lost silently. */
export interface DeadLetter {
  commandId: string;
  type: string;
  command: SyncCommand;
  localDate: string;
  createdAt: string;
  code: string | null;
  deadLetteredAt: string;
}

export interface SyncSnapshot {
  state: NetState;
  queuedCount: number;
  lastSyncedAt: string | null;
  notices: SyncNotice[];
  /** Set when the local mirror could not be opened at all. There is no data to render and no pass to retry into, so the shell says so instead of showing an empty day. */
  initError: string | null;
  readiness: SyncReadiness;
  /** Epoch ms when `readiness` last became `ready`; a mirror query whose data is older is still showing its pre-pull answer. */
  readySince: number;
  /** Command ids of the batch on the wire right now. */
  sending: string[];
}

export const SYNC_META_KEYS = {
  cursor: 'cursor',
  epoch: 'sync-epoch',
  deviceId: 'device-id',
  lastSyncedAt: 'last-synced-at',
  mirrorReady: 'mirror-ready',
  deletionPending: 'deletion-pending',
  outboxSeq: 'outbox-seq',
  exportJobId: 'export-job-id',
  deletionFlow: 'deletion-flow',
  weeklyReview: 'weekly-review',
  deadLetters: 'dead-letters',
  coveredDomains: 'covered-domains',
  backfillCursor: 'backfill-cursor',
} as const;
