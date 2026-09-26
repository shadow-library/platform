import { and, eq, inArray, sql } from 'drizzle-orm';

import { type FinalizeReview, type PrimaryDatabase, schema } from '@server/database';

import { findHardLine } from '../ai/hard-line';
import { effectiveChange } from './finalize-review-items';

export interface BridgePosition {
  entityKey: string;
  location: string | null;
  conditions: string[];
}

/** What a standard call may know about an isolated chapter: the items the author approved against its current revision, and nothing else. */
export interface IsolationBridge {
  chapter: number;
  revision: number;
  summary: string | null;
  positions: BridgePosition[];
  /** Approved lines left out because they cross the hard line. */
  droppedByHardLine: number;
  /** Approved places and conditions left out because they run past a short line. */
  droppedOverLength: number;
}

export interface BridgeSubject {
  chapter: number;
  isolated: boolean;
}

export interface BridgeCandidateItem extends Pick<FinalizeReview.Item, 'category' | 'decision' | 'proposed' | 'edited'> {
  /** For a position: whether its character is already in the Story Bible's roster. */
  known: boolean;
}

/** A review of an isolated chapter at the revision its draft stands at, as the bridge query reads it. */
export interface BridgeCandidate {
  id: bigint;
  chapter: number;
  revision: number;
  status: FinalizeReview.Status;
  isolated: boolean;
  /** Whether the review read the draft's text as it stands, compared in the database so the body never leaves it. */
  textCurrent: boolean;
  /** No summary waits for the author (nor, in a review without one, any item): until then the review before it keeps standing. */
  settled: boolean;
  items: BridgeCandidateItem[];
}

export type BridgeLoader = (subjects: readonly BridgeSubject[]) => Promise<Map<number, IsolationBridge>>;

type BridgeReader = Pick<PrimaryDatabase, 'select'>;

/** A revert undoes the Story Bible rows a finalize wrote, not the summary and positions the author approved (P4-48). */
const CROSSING_STATUSES: readonly FinalizeReview.Status[] = ['ready', 'applied', 'reverted'];
const MAX_BRIDGE_LINE = 60;

/**
 * The bridge the author approved in one review, or null when the review cannot decide one: another revision or text, a review still being read,
 * failed or waiting for its summary to be answered, or one that never read an isolated chapter. A position stands only for a character in the
 * roster or one the same review adds.
 */
export function approvedBridge(candidate: BridgeCandidate): IsolationBridge | null {
  if (!candidate.isolated || !candidate.textCurrent || !candidate.settled || !CROSSING_STATUSES.includes(candidate.status)) return null;
  const approved = candidate.items.filter(item => item.decision === 'kept' || item.decision === 'edited');
  const addedEntities = new Set(approved.map(effectiveChange).flatMap(change => (change.category === 'entity' ? [change.entity.entityKey] : [])));
  let droppedByHardLine = 0;
  let droppedOverLength = 0;
  // Standard packs are not screened for the hard line the way unrestricted ones are, so approval alone never carries a line that crosses it.
  const readable = (text: string | null | undefined, maxLength = Infinity): string | null => {
    const trimmed = text?.trim();
    if (!trimmed) return null;
    if (trimmed.length > maxLength) {
      droppedOverLength++;
      return null;
    }
    if (!findHardLine([trimmed])) return trimmed;
    droppedByHardLine++;
    return null;
  };
  let summary: string | null = null;
  const positions: BridgePosition[] = [];
  for (const item of approved) {
    const change = effectiveChange(item);
    if (change.category === 'summary') summary = readable(change.text);
    if (change.category !== 'character_state') continue;
    const entityKey = readable(change.state.entityKey);
    if (!entityKey || !(item.known || addedEntities.has(entityKey))) continue;
    const location = readable(change.state.location, MAX_BRIDGE_LINE);
    const conditions = (change.state.conditions ?? []).map(condition => readable(condition, MAX_BRIDGE_LINE)).filter((condition): condition is string => condition !== null);
    if (location || conditions.length > 0) positions.push({ entityKey, location, conditions });
  }
  return { chapter: candidate.chapter, revision: candidate.revision, summary, positions, droppedByHardLine, droppedOverLength };
}

function parsedItems(items: unknown): BridgeCandidateItem[] {
  const parsed: unknown = typeof items === 'string' ? JSON.parse(items) : items;
  return Array.isArray(parsed) ? (parsed as BridgeCandidateItem[]) : [];
}

/**
 * One statement, so the drafts, reviews and items come from one snapshot: only reviews at each draft's current revision, only their approved
 * items, and the text compared by hash in the database. `hashReviewedBody` is the hex sha256 of the body's UTF-8 bytes, which this mirrors.
 */
export async function readBridgeCandidates(db: BridgeReader, projectId: bigint, chapters: readonly number[]): Promise<BridgeCandidate[]> {
  if (chapters.length === 0) return [];
  const reviews = schema.finalizeReviews;
  const drafts = schema.drafts;
  const rows = await db
    .select({
      id: reviews.id,
      chapter: reviews.chapter,
      revision: reviews.draftRevision,
      status: reviews.status,
      isolated: reviews.isolated,
      textCurrent: sql<boolean>`${reviews.sourceHash} = encode(sha256(convert_to(${drafts.body}, 'UTF8')), 'hex')`,
      settled: sql<boolean>`not exists(
        select 1 from ${schema.finalizeReviewItems} o
        where o.review_id = ${reviews.id} and o.decision is null
          and (o.category = 'summary' or not exists(select 1 from ${schema.finalizeReviewItems} s where s.review_id = ${reviews.id} and s.category = 'summary'))
      )`,
      items: sql<unknown>`coalesce((
        select jsonb_agg(jsonb_build_object(
          'category', i.category, 'decision', i.decision, 'proposed', i.proposed, 'edited', i.edited,
          'known', exists(select 1 from ${schema.entities} e where e.project_id = ${reviews.projectId} and e.entity_key = i.proposed #>> '{state,entityKey}')
        ) order by i.position, i.id)
        from ${schema.finalizeReviewItems} i
        where i.review_id = ${reviews.id} and i.decision in ('kept', 'edited')
      ), '[]'::jsonb)`,
    })
    .from(reviews)
    .innerJoin(drafts, and(eq(drafts.projectId, reviews.projectId), eq(drafts.chapter, reviews.chapter), eq(drafts.revision, reviews.draftRevision)))
    .where(and(eq(reviews.projectId, projectId), inArray(reviews.chapter, [...chapters]), eq(reviews.isolated, true), inArray(reviews.status, [...CROSSING_STATUSES])));
  return rows.map(row => ({ ...row, items: parsedItems(row.items) }));
}

/**
 * Per chapter, the newest review that decides a bridge, even one that carries nothing: a bridge read again after a revert or an amend replaces the
 * one before it once its summary is answered.
 */
export function decidingBridges(candidates: readonly BridgeCandidate[]): Map<number, IsolationBridge> {
  const bridges = new Map<number, IsolationBridge>();
  for (const candidate of [...candidates].sort((left, right) => Number(right.id - left.id))) {
    if (bridges.has(candidate.chapter)) continue;
    const bridge = approvedBridge(candidate);
    if (bridge) bridges.set(candidate.chapter, bridge);
  }
  return bridges;
}

/** The deciding bridges that carry something across. */
export function newestBridges(candidates: readonly BridgeCandidate[]): Map<number, IsolationBridge> {
  return new Map([...decidingBridges(candidates)].filter(([, bridge]) => bridge.summary !== null || bridge.positions.length > 0));
}

/** The approved bridges of the isolated chapters among `subjects`, keyed by chapter; a standard chapter never needs one and is not looked up. */
export async function loadIsolationBridges(db: BridgeReader, projectId: bigint, subjects: readonly BridgeSubject[]): Promise<Map<number, IsolationBridge>> {
  const chapters = [...new Set(subjects.filter(subject => subject.isolated).map(subject => subject.chapter))];
  return newestBridges(await readBridgeCandidates(db, projectId, chapters));
}

/** A loader that reads each chapter's bridge once however many sections of one pack ask for it. */
export function bridgeLoader(db: BridgeReader, projectId: bigint): BridgeLoader {
  const pending = new Map<number, Promise<IsolationBridge | null>>();
  return async subjects => {
    const missing = [...new Set(subjects.filter(subject => subject.isolated && !pending.has(subject.chapter)).map(subject => subject.chapter))];
    if (missing.length > 0) {
      const loaded = loadIsolationBridges(
        db,
        projectId,
        missing.map(chapter => ({ chapter, isolated: true })),
      );
      for (const chapter of missing)
        pending.set(
          chapter,
          loaded.then(bridges => bridges.get(chapter) ?? null),
        );
    }
    const bridges = new Map<number, IsolationBridge>();
    for (const { chapter, isolated } of subjects) {
      const bridge = isolated ? await pending.get(chapter) : null;
      if (bridge) bridges.set(chapter, bridge);
    }
    return bridges;
  };
}

/** A chapter's summary as a standard call may read it: its own for a standard chapter, the approved bridge summary for an isolated one. */
export function bridgedSummary(row: { isolated: boolean; summary: string | null }, bridge: IsolationBridge | undefined): string | null {
  return row.isolated ? (bridge?.summary ?? null) : row.summary;
}
