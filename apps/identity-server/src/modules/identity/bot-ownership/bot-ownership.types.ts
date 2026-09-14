import { type Bot } from '@server/modules/infrastructure/datastore';

export interface BotAwareApplication {
  id: number;
  name: string;
  displayName: string | null;
  logoUrl: string | null;
  audience: string;
  scope: string;
}

export interface BotOwnedRecords {
  kind: string;
  count: number;
}

export interface BotApplicationOwnership {
  applicationId: number;
  name: string;
  displayName: string | null;
  logoUrl: string | null;
  /** False when the application did not answer within the per-application budget; `records` is then empty rather than zero. */
  available: boolean;
  records: BotOwnedRecords[];
  total: number;
}

export interface BotTransferState {
  applicationId: number;
  name: string;
  displayName: string | null;
  status: Bot.OwnershipTransferStatus;
  attempts: number;
  /** Failed and out of attempts: the worker has stopped retrying and an admin must retry it. */
  exhausted: boolean;
  nextAttemptAt: Date | null;
  completedAt: Date | null;
}

export interface BotOwnership {
  applications: BotApplicationOwnership[];
  /** At least one application did not answer, so the counts are incomplete. */
  degraded: boolean;
  transfers: BotTransferState[];
}

export interface BotDeletionProgress {
  requestedAt: Date;
  transferTo: bigint;
  pending: number;
  done: number;
  failed: number;
  /** At least one transfer is out of attempts; deletion cannot finish until an admin retries it. */
  stalled: boolean;
  /** Applications behind `stalled`, so the bot detail can name them without the ownership fan-out. */
  stalledApplications: string[];
}
