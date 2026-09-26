import { describe, expect, it } from 'bun:test';
import { and, eq, inArray } from 'drizzle-orm';

import { HARD_LINE_LEXICON } from '@modules/ai/hard-line';
import { NO_APPROVED_BRIDGE, NO_BRIDGE_SUMMARY } from '@modules/ai/isolation-read-policy';
import { buildReviewItems, editedChange, type ReviewMaterial } from '@modules/finalize-review/finalize-review-items';
import { newestBridges } from '@modules/finalize-review/isolation-bridge';
import { emptyPolicy } from '@modules/plugins/plugin-policy.service';
import { type FinalizeReview, schema } from '@server/database';

import { writerAssembler, writerDb } from '../ai/writer-disclosure-fixtures';
import { bridgeCandidates, bridgeReview, type BridgeReviewOptions } from './bridge-fixtures';

type Row = Record<string, unknown>;

const MARKER = 'RAW_ISOLATED_MARKER';
const UNAPPROVED = 'UNAPPROVED_PLACE';
const PROSE = `${MARKER} walks the flooded cellar alone.`;
const BRIDGE_FOUR = 'The keeper spent the night in the cellar and came back quiet.';
const BRIDGE_FIVE = 'The keeper and the apprentice sealed the cellar at dawn.';

interface ChapterSpec {
  isolated?: boolean;
  revision?: number;
  review?: FinalizeReview.Status | null;
  decision?: FinalizeReview.Decision | null;
  status?: 'done' | 'draft';
}

/** Chapters 1…`last` of a one-volume book: standard ones read as prose, isolated ones carry the marker in every raw field. */
function book(last: number, specs: Record<number, ChapterSpec>, briefFor?: { chapter: number; contextRefs: string[] }): Map<string, Row[]> {
  const chapters: Row[] = [];
  const drafts: Row[] = [];
  const reviews: Row[] = [];
  for (let number = 1; number <= last; number++) {
    const spec = specs[number] ?? {};
    const isolated = spec.isolated ?? false;
    const body = isolated ? `${PROSE} (chapter ${number})` : `Chapter ${number} ends at the pier.`;
    const summary = isolated ? `${MARKER} summary of chapter ${number}` : `Standard chapter ${number}.`;
    const status = spec.status ?? 'done';
    if (status === 'done') chapters.push({ id: BigInt(number), projectId: 7n, number, status, isolated, title: isolated ? MARKER : null, content: body, summary, volumeKey: 'v1' });
    const state = isolated ? { lastBeat: MARKER, characterPositions: [{ entityKey: 'keeper', location: MARKER }] } : null;
    const revision = spec.revision ?? 1;
    drafts.push({ id: BigInt(number), projectId: 7n, chapter: number, revision, status: status === 'done' ? 'final' : 'draft', isolated, body, summary, state, staleReason: null });
    if (!isolated || spec.review === null) continue;
    const approved = bridgeReview({
      chapter: number,
      revision: 1,
      body,
      summary: number === 5 ? BRIDGE_FIVE : BRIDGE_FOUR,
      positions: [{ entityKey: 'keeper', location: 'the north pier', conditions: ['a sprained wrist'] }],
      status: spec.review ?? 'applied',
      decision: spec.decision,
    });
    const unanswered = {
      ...approved.items[1],
      itemKey: 'character_state:apprentice',
      decision: null,
      proposed: { category: 'character_state', state: { entityKey: 'apprentice', location: UNAPPROVED } },
    };
    reviews.push({ ...approved, projectId: 7n, items: [...approved.items, unanswered] });
  }
  return new Map<string, Row[]>([
    ['projects', [{ id: 7n, instructions: null, storyCurrentChapter: last, contentMode: 'standard' }]],
    ['chapters', chapters],
    ['drafts', drafts],
    ['finalizeReviews', reviews],
    ['entities', [{ id: 1n, projectId: 7n, entityKey: 'keeper' }]],
    ['briefs', briefFor ? [{ id: 1n, projectId: 7n, chapter: briefFor.chapter, body: 'Open on the pier.', contextRefs: briefFor.contextRefs, pov: null, volumeKey: null }] : []],
  ]);
}

async function writerPack(rows: Map<string, Row[]>, chapter: number, permissive = false): Promise<{ rendered: string; section: (key: string) => string }> {
  const pack = await writerAssembler(writerDb(rows)).forChapter(7n, chapter, {
    dryRun: true,
    budgetTokens: 1_000_000,
    ...(permissive ? { policy: emptyPolicy('permissive') } : {}),
  });
  return { rendered: pack.rendered, section: key => pack.sections.find(section => section.key === key)?.rendered ?? '' };
}

describe('the approved bridge of one isolated chapter', () => {
  const DRAFT = { chapter: 4, revision: 1, body: PROSE };
  const ROSTER = [{ entityKey: 'keeper' }, { entityKey: 'apprentice' }];
  const review = (options: Partial<BridgeReviewOptions> = {}) =>
    bridgeReview({ chapter: 4, revision: 1, body: PROSE, summary: BRIDGE_FOUR, positions: [{ entityKey: 'keeper', location: 'the north pier' }], ...options });
  const bridgeOf = (reviews: Row[], draft: Row = DRAFT, entities: Row[] = ROSTER) => newestBridges(bridgeCandidates({ drafts: [draft], reviews, entities })).get(4) ?? null;
  const refused = (HARD_LINE_LEXICON.standalone[0] as RegExp).source.replace(/^\\b\(\?:|\)\\b$/g, '');

  it('should carry the approved summary and positions of the review of the current text', () => {
    expect(bridgeOf([review()])).toEqual({
      chapter: 4,
      revision: 1,
      summary: BRIDGE_FOUR,
      positions: [{ entityKey: 'keeper', location: 'the north pier', conditions: [] }],
      droppedByHardLine: 0,
      droppedOverLength: 0,
    });
  });

  it('should carry nothing once an edit moved the revision or the text', () => {
    expect(bridgeOf([review()], { ...DRAFT, revision: 2 })).toBeNull();
    expect(bridgeOf([review()], { ...DRAFT, body: `${PROSE} One more line.` })).toBeNull();
  });

  it('should carry no item the author has not approved', () => {
    expect(bridgeOf([review({ decision: null })])).toBeNull();
    expect(bridgeOf([review({ decision: 'skipped' })])).toBeNull();
  });

  it('should carry the author’s edit of the summary rather than what was read', () => {
    const edited = review();
    Object.assign(edited.items[0] as FinalizeReview.Item, { decision: 'edited', edited: { category: 'summary', text: 'The keeper came back.' } });

    expect(bridgeOf([edited])?.summary).toBe('The keeper came back.');
  });

  it('should carry nothing from a review still being read, one that failed, or one of a standard chapter', () => {
    for (const status of ['preparing', 'failed'] as const) expect(bridgeOf([review({ status })])).toBeNull();
    expect(bridgeOf([{ ...review(), isolated: false }])).toBeNull();
  });

  it('should keep the bridge after a revert of the Story Bible updates, which undoes rows, not the approved summary', () => {
    expect(bridgeOf([review({ status: 'reverted' })])).toMatchObject({ summary: BRIDGE_FOUR, positions: [{ entityKey: 'keeper' }] });
  });

  it('should let the newest review decide only once its summary is answered, the one before it standing until then', () => {
    const newer = (options: Partial<BridgeReviewOptions>) => ({ ...review({ bridgeOnly: true, summary: BRIDGE_FIVE, positions: [], ...options }), id: 99n });

    expect(bridgeOf([review({ status: 'reverted' }), newer({ status: 'preparing' })])?.summary).toBe(BRIDGE_FOUR);
    expect(bridgeOf([review({ status: 'reverted' }), newer({ status: 'ready', decision: null })])?.summary).toBe(BRIDGE_FOUR);
    expect(bridgeOf([review({ status: 'reverted' }), newer({ status: 'ready', decision: 'skipped' })])).toBeNull();
    expect(bridgeOf([review({ status: 'reverted' }), newer({ status: 'ready' })])?.summary).toBe(BRIDGE_FIVE);
  });

  it('should wait on any open item of a review with no summary to answer', () => {
    const noSummary = { ...review({ summary: undefined, bridgeOnly: true, decision: null }), id: 99n };

    expect(bridgeOf([review(), noSummary])?.summary).toBe(BRIDGE_FOUR);
  });

  it('should hand the approved positions over in the order the review lists them', () => {
    const ordered = review({
      summary: undefined,
      positions: [
        { entityKey: 'keeper', location: 'the north pier' },
        { entityKey: 'apprentice', location: 'the lamp room' },
      ],
    });
    const [keeper, apprentice] = ordered.items;
    Object.assign(keeper as object, { position: 2 });
    Object.assign(apprentice as object, { position: 1 });

    expect(bridgeOf([ordered])?.positions.map(position => position.entityKey)).toEqual(['apprentice', 'keeper']);
  });

  it('should only read reviews of the requested project and chapters', () => {
    const where = and(eq(schema.finalizeReviews.projectId, 1n), inArray(schema.finalizeReviews.chapter, [5]));

    expect(bridgeCandidates({ drafts: [DRAFT], reviews: [review()], entities: ROSTER }, where)).toEqual([]);
    expect(
      bridgeCandidates({ drafts: [DRAFT], reviews: [review()], entities: ROSTER }, and(eq(schema.finalizeReviews.projectId, 2n), inArray(schema.finalizeReviews.chapter, [4]))),
    ).toEqual([]);
    expect(
      bridgeCandidates({ drafts: [DRAFT], reviews: [review()], entities: ROSTER }, and(eq(schema.finalizeReviews.projectId, 1n), inArray(schema.finalizeReviews.chapter, [4]))),
    ).toHaveLength(1);
  });

  it('should carry a position only for a character in the roster or one the same review adds', () => {
    const stranger = review({ summary: undefined, positions: [{ entityKey: 'stranger', location: 'the cellar' }] });
    expect(bridgeOf([stranger])).toBeNull();

    const added = {
      category: 'entity',
      decision: 'kept',
      proposed: { category: 'entity', entity: { entityKey: 'stranger', name: 'The stranger', type: 'character' } },
      edited: null,
    };
    expect(bridgeOf([{ ...stranger, items: [...stranger.items, added] }])?.positions).toEqual([{ entityKey: 'stranger', location: 'the cellar', conditions: [] }]);
  });

  it('should drop a place or a condition longer than a short line', () => {
    const long = 'the long corridor under the old harbour wall, past the flooded stairs';
    const positions = [{ entityKey: 'keeper', location: long, conditions: ['a sprained wrist', `${long} and more`] }];

    expect(bridgeOf([review({ positions })])).toMatchObject({ positions: [{ entityKey: 'keeper', location: null, conditions: ['a sprained wrist'] }], droppedOverLength: 2 });
  });

  it('should drop and count every approved line the hard line refuses, keys and conditions included', () => {
    const positions = [
      { entityKey: 'keeper', location: `the ${refused} room`, conditions: ['bruised', `a ${refused} mark`] },
      { entityKey: `${refused}`, location: 'the north pier' },
      { entityKey: 'apprentice', location: 'the north pier' },
    ];

    expect(bridgeOf([review({ summary: `They found the ${refused}.`, positions })], DRAFT, [...ROSTER, { entityKey: refused }])).toEqual({
      chapter: 4,
      revision: 1,
      summary: null,
      positions: [
        { entityKey: 'keeper', location: null, conditions: ['bruised'] },
        { entityKey: 'apprentice', location: 'the north pier', conditions: [] },
      ],
      droppedByHardLine: 4,
      droppedOverLength: 0,
    });
  });
});

describe('the bridge as the context assembler reads it', () => {
  it('should hand standard chapter N+1 only the approved bridge of isolated chapter N', async () => {
    const pack = await writerPack(book(4, { 4: { isolated: true } }), 5);

    expect(pack.section('prev_ending')).toContain(`Summary: ${BRIDGE_FOUR}`);
    expect(pack.section('prev_ending')).toContain('the north pier');
    expect(pack.section('continuation_state')).toContain('a sprained wrist');
    expect(pack.section('memory')).toContain(`Ch 4: ${BRIDGE_FOUR}`);
    expect(pack.rendered).not.toContain(MARKER);
    expect(pack.rendered).not.toContain(UNAPPROVED);
  });

  it('should hand standard chapter N+5 the approved bridge wherever chapter N reaches it, and never its prose', async () => {
    const pack = await writerPack(book(8, { 4: { isolated: true } }, { chapter: 9, contextRefs: ['chapter:4'] }), 9);

    expect(pack.section('ref:chapter:4')).toContain(`Ch 4: ${BRIDGE_FOUR}`);
    expect(pack.section('memory')).not.toContain('Ch 4');
    expect(pack.rendered).not.toContain(MARKER);
    expect(pack.rendered).not.toContain(UNAPPROVED);
  });

  it('should wall chapter N off from N+1 and N+5 once an edit invalidated its bridge', async () => {
    const amended = { 4: { isolated: true, revision: 2 } };
    const next = await writerPack(book(4, amended), 5);
    const later = await writerPack(book(8, amended, { chapter: 9, contextRefs: ['chapter:4'] }), 9);

    expect(next.section('prev_ending')).toEndWith(NO_APPROVED_BRIDGE);
    expect(next.section('continuation_state')).toBe('');
    expect(next.section('memory')).toContain(`Ch 4: ${NO_BRIDGE_SUMMARY}`);
    expect(later.section('ref:chapter:4')).toContain(NO_BRIDGE_SUMMARY);
    for (const pack of [next, later]) {
      expect(pack.rendered).not.toContain(BRIDGE_FOUR);
      expect(pack.rendered).not.toContain(MARKER);
    }
  });

  it('should carry nothing of an isolated chapter whose bridge is prepared but unanswered', async () => {
    const pack = await writerPack(book(4, { 4: { isolated: true, review: 'ready', decision: null } }), 5);

    expect(pack.section('prev_ending')).toEndWith(NO_APPROVED_BRIDGE);
    expect(pack.rendered).not.toContain(BRIDGE_FOUR);
    expect(pack.rendered).not.toContain(UNAPPROVED);
    expect(pack.rendered).not.toContain(MARKER);
  });

  it('should hand the standard chapter after two consecutive isolated ones each chapter’s own approved bridge', async () => {
    const pack = await writerPack(book(5, { 4: { isolated: true }, 5: { isolated: true } }), 6);

    expect(pack.section('prev_ending')).toContain(`Summary: ${BRIDGE_FIVE}`);
    expect(pack.section('memory')).toContain(`Ch 4: ${BRIDGE_FOUR}`);
    expect(pack.section('memory')).toContain(`Ch 5: ${BRIDGE_FIVE}`);
    expect(pack.rendered).not.toContain(MARKER);
  });

  it('should keep one isolated chapter walled off while the next one’s approved bridge still crosses', async () => {
    const pack = await writerPack(book(5, { 4: { isolated: true, review: null }, 5: { isolated: true } }), 6);

    expect(pack.section('prev_ending')).toContain(`Summary: ${BRIDGE_FIVE}`);
    expect(pack.section('memory')).toContain(`Ch 4: ${NO_BRIDGE_SUMMARY}`);
    expect(pack.rendered).not.toContain(MARKER);
  });

  it('should let the unrestricted writer of the second of two isolated chapters read the first as written', async () => {
    const pack = await writerPack(book(4, { 4: { isolated: true, review: null } }), 5, true);

    expect(pack.section('prev_ending')).toContain(`${MARKER} summary of chapter 4`);
    expect(pack.section('continuation_state')).toContain(MARKER);
    expect(pack.rendered).not.toContain(PROSE);
  });
});

describe('the bridge items of an isolated chapter’s review', () => {
  const material = (overrides: Partial<ReviewMaterial> = {}): ReviewMaterial => ({
    extraction: {
      appeared: ['keeper'],
      newEntities: [],
      threads: [],
      mysteries: [],
      timeline: [],
      relationships: [],
      power: [],
      characterStates: [{ entityKey: 'keeper', location: 'the north pier', evidence: PROSE }],
      knowledgeChanges: [],
      chapterSummary: BRIDGE_FOUR,
      milestones: [],
    },
    isolated: true,
    claimedMilestones: [],
    milestones: [],
    entityKeys: new Set(['keeper']),
    plannedLearns: new Set(),
    plannedFactKeys: [],
    facts: [],
    unlock: { chapter: 4, endingChapter: null, volumeKey: null, volumeOrdinals: new Map(), reachedMilestones: new Set() },
    autoKeep: new Set(['appearance', 'character_state', 'summary']),
    ...overrides,
  });

  it('should ask the author about the bridge summary one by one and never keep it automatically', () => {
    const [summary] = buildReviewItems(material()).filter(item => item.category === 'summary');

    expect(summary).toMatchObject({ itemKey: 'summary', triage: 'consequential', decision: null, autoKept: false, proposed: { category: 'summary', text: BRIDGE_FOUR } });
  });

  it('should ask about each isolated position one by one, so keeping the routine batch never sends one across', () => {
    const [position] = buildReviewItems(material()).filter(item => item.category === 'character_state');

    expect(position).toMatchObject({ triage: 'consequential', decision: null, autoKept: false });
    expect(buildReviewItems(material({ isolated: false })).find(item => item.category === 'character_state')?.triage).toBe('routine');
  });

  it('should read no bridge summary from a standard chapter', () => {
    expect(buildReviewItems(material({ isolated: false })).map(item => item.category)).not.toContain('summary');
  });

  it('should ask only for the summary when a final chapter’s bridge is read again after an amend', () => {
    expect(buildReviewItems(material({ bridgeOnly: true })).map(item => item.category)).toEqual(['summary']);
  });

  it('should take an edited summary and refuse an empty one', () => {
    expect(editedChange({ category: 'summary', text: BRIDGE_FOUR }, { text: 'The keeper came back.' })).toEqual({ change: { category: 'summary', text: 'The keeper came back.' } });
    expect(editedChange({ category: 'summary', text: BRIDGE_FOUR }, { text: ' ' })).toHaveProperty('refused');
  });
});
