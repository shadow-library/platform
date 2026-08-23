import { type CommandEnvelopeDto, type SyncCommandOutcomeDto, type SyncDeltaResponseDto, type SyncTombstoneDto } from '@/lib/apis/api-types.gen';
import { type Command } from '@/lib/data';

/** The delta domains shadow-memoir-server registers today. Each flips from fixture-backed to live independently. */
export type SyncDomain = 'quests' | 'quest_logs' | 'daily_states' | 'quest_streaks' | 'account' | 'devices';

export const SYNC_DOMAINS: SyncDomain[] = ['quests', 'quest_logs', 'daily_states', 'quest_streaks', 'account', 'devices'];

/** Domains the server answers with the authoritative full set rather than a watermark — the local set is replaced, never merged. */
export const SNAPSHOT_DOMAINS: SyncDomain[] = ['account', 'devices'];

export type DeltaRow = Record<string, unknown>;

export type DeltaTombstone = SyncTombstoneDto;

/** The generated contract, with `domains` narrowed from the schema's free-form object to the rows it actually carries. */
export type DeltaPage = Omit<SyncDeltaResponseDto, 'domains'> & { domains: Record<string, DeltaRow[]> };

export interface DeltaResponse {
  page: DeltaPage;
  epoch: string | null;
}

export type CommandEnvelope = CommandEnvelopeDto;

export type CommandOutcomeStatus = 'applied' | 'rejected' | 'superseded' | 'failed';

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
  command: Command;
}

export type NetState = 'online' | 'offline' | 'syncing' | 'failed' | 'signed-out';

/** A command the server refused. Surfaced once, calmly, then dropped — the outbox never holds a rejection. */
export interface SyncNotice {
  commandId: string;
  message: string;
}

export interface SyncSnapshot {
  state: NetState;
  queuedCount: number;
  lastSyncedAt: string | null;
  notices: SyncNotice[];
}

export const SYNC_META_KEYS = { cursor: 'cursor', epoch: 'sync-epoch', deviceId: 'device-id', lastSyncedAt: 'last-synced-at', outboxSeq: 'outbox-seq' } as const;
