import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { type DbExecutor, type Ledger, schema } from '@server/database';

import { type ArtifactState, loadArtifactStates, MISSING_ARTIFACT } from './artifact-state';

export type IdeaRejectionEntry = Pick<Ledger.Entry, 'ideaId' | 'rejectionScope' | 'rejectionAnchor'>;

export interface RejectionContext {
  /** The volume whose state is `active`; a `not_now` rejection lasts only while it stays the same. */
  activeVolumeKey: string | null;
  /** Current states of the records `not_this_version` rejections were anchored to. */
  states: Readonly<Record<string, ArtifactState>>;
}

function anchoredStates(anchor: Ledger.RejectionAnchor | null): Record<string, Ledger.TargetState> | null {
  return anchor !== null && 'states' in anchor ? anchor.states : null;
}

function sameState(recorded: Ledger.TargetState, current: ArtifactState = MISSING_ARTIFACT): boolean {
  return recorded.exists === current.exists && recorded.revision === current.revision && recorded.contentHash === current.contentHash;
}

/**
 * `never` holds until the author withdraws it; `not_now` holds while the volume active when it was recorded is still the active one; and
 * `not_this_version` holds while every record the idea would change is exactly as it was when the author turned it down.
 */
export function rejectionInScope(entry: IdeaRejectionEntry, context: RejectionContext): boolean {
  if (entry.ideaId === null) return false;
  switch (entry.rejectionScope) {
    case null:
      return false;
    case 'never':
      return true;
    case 'not_now':
      return entry.rejectionAnchor !== null && 'volumeKey' in entry.rejectionAnchor && entry.rejectionAnchor.volumeKey === context.activeVolumeKey;
    case 'not_this_version': {
      const states = Object.entries(anchoredStates(entry.rejectionAnchor) ?? {});
      return states.length > 0 && states.every(([ref, state]) => sameState(state, context.states[ref]));
    }
  }
}

export function rejectionAnchor(scope: Ledger.RejectionScope, context: RejectionContext, refs: readonly string[]): Ledger.RejectionAnchor | null {
  if (scope === 'never') return null;
  if (scope === 'not_now') return { volumeKey: context.activeVolumeKey };
  return { states: Object.fromEntries(refs.map(ref => [ref, context.states[ref] ?? MISSING_ARTIFACT])) };
}

export async function loadActiveVolumeKey(db: DbExecutor, projectId: bigint): Promise<string | null> {
  const volume = await db.query.volumes.findFirst({
    columns: { volumeKey: true },
    where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.state, 'active')),
    orderBy: asc(schema.volumes.ordinal),
  });
  return volume?.volumeKey ?? null;
}

export async function loadRejectionContext(db: DbExecutor, projectId: bigint, entries: readonly IdeaRejectionEntry[], refs: readonly string[] = []): Promise<RejectionContext> {
  const anchored = entries.flatMap(entry => (entry.rejectionScope === 'not_this_version' ? Object.keys(anchoredStates(entry.rejectionAnchor) ?? {}) : []));
  const wanted = [...new Set([...anchored, ...refs])];
  const [activeVolumeKey, states] = await Promise.all([loadActiveVolumeKey(db, projectId), wanted.length > 0 ? loadArtifactStates(db, projectId, wanted) : {}]);
  return { activeVolumeKey, states };
}

/** The active rejections among `ideaIds`, judged against the project as it stands now. */
export async function loadRejectedIdeas(db: DbExecutor, projectId: bigint, ideaIds: readonly string[]): Promise<Set<string>> {
  if (ideaIds.length === 0) return new Set();
  const table = schema.decisionLedgerEntries;
  const entries = await db.query.decisionLedgerEntries.findMany({
    columns: { ideaId: true, rejectionScope: true, rejectionAnchor: true },
    where: and(eq(table.projectId, projectId), isNull(table.supersededAt), isNotNull(table.ideaId), inArray(table.ideaId, [...new Set(ideaIds)])),
  });
  if (entries.length === 0) return new Set();
  const context = await loadRejectionContext(db, projectId, entries);
  return new Set(entries.flatMap(entry => (entry.ideaId !== null && rejectionInScope(entry, context) ? [entry.ideaId] : [])));
}

/** Drops the idea rejections whose scope has lapsed — a volume moved on, or the record changed — so they stop steering the model. */
export async function withoutLapsedRejections<T extends Partial<IdeaRejectionEntry>>(db: DbExecutor, projectId: bigint, entries: readonly T[]): Promise<T[]> {
  const isRejection = (entry: T): entry is T & IdeaRejectionEntry => Boolean(entry.ideaId && entry.rejectionScope);
  const rejections = entries.filter(isRejection);
  if (rejections.length === 0) return [...entries];
  const context = await loadRejectionContext(db, projectId, rejections);
  return entries.filter(entry => !isRejection(entry) || rejectionInScope(entry, context));
}
