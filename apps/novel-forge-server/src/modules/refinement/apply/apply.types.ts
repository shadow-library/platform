import { type PrimaryTransaction } from '@server/database';

import { type ArtifactState } from '../artifact-state';
import { type ContentOp } from '../change-set';
import { type OpSource } from '../write-policy';

export interface AppliedArtifact {
  artifactRef: string;
  newRevision: number | null;
  newSaveSeq?: number;
  newDraftId?: bigint;
}

export interface OpResult {
  index: number;
  /** `reverted`: a change a chat turn applied, undone on its own while the rest of its turn stays applied. */
  status: 'applied' | 'declined' | 'pending' | 'failed' | 'reverted';
  /** Set on every op a chat turn applied: whether the author's words backed it or it was the model's idea. */
  source?: OpSource;
  error?: string;
  /** Why the engine declined an op the author did not reject; only proposals applied before the quote rule carry one. */
  note?: string;
  result?: Record<string, unknown>;
}

export interface ApplyContext {
  tx: PrimaryTransaction;
  projectId: bigint;
  applied: AppliedArtifact[];
  staleMarked: string[];
}

export interface BaselineMismatch {
  artifactRef: string;
  expected: ArtifactState | undefined;
  actual: ArtifactState;
}

export interface ArtifactHandler<Op extends ContentOp = ContentOp> {
  apply(ctx: ApplyContext, op: Op): Promise<void>;
  /** Synthesizes the op that undoes `op` from the rows as they stand right before it runs, inside the same transaction. */
  inverse(ctx: ApplyContext, op: Op): Promise<ContentOp | null>;
}

export type ContentOpHandlers<K extends ContentOp['op'] = ContentOp['op']> = { [P in K]: ArtifactHandler<Extract<ContentOp, { op: P }>> };

// A captured inverse writes back exactly what the row held: a field that was empty comes back `null`, so undoing an op that filled it
// empties it again instead of merging as "keep". `OP_SPECS` refuses `null` for these fields, so only an inverse ever carries one.
export type Restorable<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] | null };
