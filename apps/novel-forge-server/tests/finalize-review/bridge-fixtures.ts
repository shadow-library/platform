import { type SQL } from 'drizzle-orm';

import { WALLED_OFF_EXCERPT } from '@modules/ai/isolation-read-policy';
import { type ReviewWithItems } from '@modules/finalize-review/finalize-review-gate';
import { type BridgeCandidate } from '@modules/finalize-review/isolation-bridge';
import { hashReviewedBody } from '@modules/review/review-findings';
import { type FinalizeReview } from '@server/database';

import { matchesWhere } from '../sql-filter';

type Row = Record<string, unknown>;

export interface BridgeTables {
  drafts: readonly Row[];
  reviews: readonly Row[];
  entities?: readonly Row[];
}

const CROSSING = new Set(['ready', 'applied', 'reverted']);

const sameProject = (left: Row, right: Row): boolean => left['projectId'] === undefined || right['projectId'] === undefined || left['projectId'] === right['projectId'];
const byPosition = (left: Row, right: Row): number =>
  Number(left['position'] ?? 0) - Number(right['position'] ?? 0) || Number(BigInt(String(left['id'] ?? 0)) - BigInt(String(right['id'] ?? 0)));

/**
 * What the bridge query returns for these rows, `where` applied to the review as the real statement applies it (project, chapters, isolation,
 * status): reviews at each draft's revision, whether their summary is answered, their approved items in order, the text compared by hash.
 */
export function bridgeCandidates({ drafts, reviews, entities = [] }: BridgeTables, where?: SQL): BridgeCandidate[] {
  const roster = new Set(entities.map(entity => entity['entityKey']));
  return reviews.flatMap(review => {
    if (!matchesWhere(review, where)) return [];
    const draft = drafts.find(row => sameProject(row, review) && row['chapter'] === review['chapter'] && row['revision'] === review['draftRevision']);
    if (!draft || review['isolated'] !== true || !CROSSING.has(String(review['status']))) return [];
    const all = [...((review['items'] ?? []) as Row[])].sort(byPosition);
    const hasSummary = all.some(item => item['category'] === 'summary');
    const settled = !all.some(item => item['decision'] == null && (item['category'] === 'summary' || !hasSummary));
    const items = all
      .filter(item => item['decision'] === 'kept' || item['decision'] === 'edited')
      .map(item => ({ ...item, known: roster.has((item['proposed'] as { state?: { entityKey?: string } }).state?.entityKey) }));
    return [
      {
        id: review['id'] as bigint,
        chapter: review['chapter'] as number,
        revision: review['draftRevision'] as number,
        status: review['status'] as FinalizeReview.Status,
        isolated: true,
        textCurrent: review['sourceHash'] === hashReviewedBody(String(draft['body'] ?? '')),
        settled,
        items: items as unknown as BridgeCandidate['items'],
      },
    ];
  });
}

/** A `db.select` that answers the bridge query from in-memory rows, read at call time. */
export function bridgeSelect(tables: () => BridgeTables): () => { from: () => { innerJoin: () => { where: (where: SQL) => Promise<BridgeCandidate[]> } } } {
  return () => ({ from: () => ({ innerJoin: () => ({ where: async (where: SQL) => bridgeCandidates(tables(), where) }) }) });
}

export interface BridgeReviewOptions {
  chapter: number;
  revision: number;
  body: string;
  summary?: string;
  positions?: { entityKey: string; location?: string; conditions?: string[] }[];
  decision?: FinalizeReview.Decision | null;
  status?: FinalizeReview.Status;
  bridgeOnly?: boolean;
}

function bridgeItem(itemKey: string, category: FinalizeReview.Category, proposed: Record<string, unknown>, decision: FinalizeReview.Decision | null): FinalizeReview.Item {
  return {
    id: BigInt(itemKey.length),
    reviewId: 1n,
    itemKey,
    position: 0,
    category,
    triage: 'consequential',
    basis: 'inferred',
    subjectKey: itemKey,
    claim: itemKey,
    evidence: null,
    proposed,
    edited: null,
    flag: null,
    dependents: null,
    decision,
    reason: decision === 'skipped' ? 'not this one' : null,
    autoKept: false,
    decidedAt: decision ? new Date(0) : null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/** The finalize review of an isolated chapter's text, its bridge summary and positions answered with `decision` (kept by default). */
export function bridgeReview(options: BridgeReviewOptions): ReviewWithItems {
  const decision = options.decision === undefined ? 'kept' : options.decision;
  const items = [
    ...(options.summary === undefined ? [] : [bridgeItem('summary', 'summary', { category: 'summary', text: options.summary }, decision)]),
    ...(options.positions ?? []).map(position =>
      bridgeItem(`character_state:${position.entityKey}`, 'character_state', { category: 'character_state', state: { ...position, evidence: WALLED_OFF_EXCERPT } }, decision),
    ),
  ];
  return {
    id: BigInt(options.chapter * 10 + options.revision),
    projectId: 1n,
    chapter: options.chapter,
    draftId: BigInt(options.chapter),
    draftRevision: options.revision,
    sourceHash: hashReviewedBody(options.body),
    planHash: null,
    isolated: true,
    bridgeOnly: options.bridgeOnly ?? false,
    status: options.status ?? 'applied',
    jobId: null,
    error: null,
    applied: null,
    appliedAt: null,
    revertedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    items,
  };
}
