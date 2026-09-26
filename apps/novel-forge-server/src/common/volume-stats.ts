import { eq } from 'drizzle-orm';

import { type DbExecutor, type Plan, schema } from '@server/database';

import { volumeContentHash } from './content-hash';

export interface VolumeChapterRow {
  number: number;
  wordCount: number | null;
}

export interface VolumeStats {
  chapterCount: number;
  firstChapter: number | null;
  lastChapter: number | null;
  wordCount: number;
}

export const EMPTY_VOLUME_STATS: VolumeStats = { chapterCount: 0, firstChapter: null, lastChapter: null, wordCount: 0 };

/** A volume's display data, computed on read from its chapters — never stored, since a volume carries no chapter count or range. */
export function deriveVolumeStats(rows: readonly VolumeChapterRow[]): VolumeStats {
  if (rows.length === 0) return EMPTY_VOLUME_STATS;
  const numbers = rows.map(row => row.number);
  return {
    chapterCount: rows.length,
    firstChapter: Math.min(...numbers),
    lastChapter: Math.max(...numbers),
    wordCount: rows.reduce((sum, row) => sum + (row.wordCount ?? 0), 0),
  };
}

export interface VolumePlanRange {
  planChapterCount: number;
  planFirstChapter: number | null;
  planLastChapter: number | null;
}

export const EMPTY_VOLUME_PLAN_RANGE: VolumePlanRange = { planChapterCount: 0, planFirstChapter: null, planLastChapter: null };

/**
 * The same range as {@link deriveVolumeStats}, but over every chapter number the volume claims anywhere in the
 * plan — final, drafted, or only briefed — so the web can place a not-yet-written chapter without asking the
 * author to assign a volume by hand.
 */
export function deriveVolumePlanRange(chapterNumbers: readonly number[]): VolumePlanRange {
  if (chapterNumbers.length === 0) return EMPTY_VOLUME_PLAN_RANGE;
  return { planChapterCount: chapterNumbers.length, planFirstChapter: Math.min(...chapterNumbers), planLastChapter: Math.max(...chapterNumbers) };
}

export interface VolumeOrdinalRow {
  volumeKey: string;
  ordinal: number;
  state: Plan.VolumeState;
}

/** "Goal met — start next": the not-started volume immediately after `volumeKey` in ordinal order, or none if there isn't one yet. */
export function nextVolumeToActivate(volumes: readonly VolumeOrdinalRow[], volumeKey: string): string | null {
  const target = volumes.find(volume => volume.volumeKey === volumeKey);
  if (!target) return null;
  const next = volumes.filter(volume => volume.ordinal > target.ordinal && volume.state === 'not_started').sort((left, right) => left.ordinal - right.ordinal)[0];
  return next?.volumeKey ?? null;
}

/**
 * The volume a fresh insert should activate, when the project has none: the lowest-ordinal not-started volume that sits
 * after every goal-met one — never one a completed volume has already passed. Null once a volume is already active, or
 * when no not-started volume qualifies.
 */
export function volumeToAutoActivate(volumes: readonly VolumeOrdinalRow[]): string | null {
  if (volumes.some(volume => volume.state === 'active')) return null;
  const passedOrdinal = volumes.filter(volume => volume.state === 'goal_met').reduce((max, volume) => Math.max(max, volume.ordinal), -Infinity);
  const candidate = volumes.filter(volume => volume.state === 'not_started' && volume.ordinal > passedOrdinal).sort((left, right) => left.ordinal - right.ordinal)[0];
  return candidate?.volumeKey ?? null;
}

/**
 * Runs after every volume insert, in the same transaction: activates `volumeToAutoActivate`'s pick if the project still
 * has none active. Locks every volume row for the project first (the same `for('update')` pattern `lockProjectPlan`
 * uses), so a concurrent insert racing on the same project blocks until this commits rather than both activating —
 * the "no active volume" and ordinal checks stay true for the update that follows because nothing else can touch
 * these rows meanwhile.
 */
export async function autoActivateVolume(tx: Pick<DbExecutor, 'select' | 'update'>, projectId: bigint): Promise<void> {
  // Locking the project, not just its volume rows: two concurrent first inserts cannot see each other's uncommitted rows.
  await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, projectId)).for('update');
  const locked = await tx.select().from(schema.volumes).where(eq(schema.volumes.projectId, projectId)).for('update');

  const activateKey = volumeToAutoActivate(locked);
  if (!activateKey) return;
  const target = locked.find(volume => volume.volumeKey === activateKey);
  if (!target) return;

  await tx
    .update(schema.volumes)
    .set({ state: 'active', revision: target.revision + 1, contentHash: volumeContentHash({ ...target, state: 'active' }), updatedAt: new Date() })
    .where(eq(schema.volumes.id, target.id));
}
