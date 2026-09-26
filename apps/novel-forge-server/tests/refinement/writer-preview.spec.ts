import { describe, expect, it } from 'bun:test';

import { loadWriterDisclosureSources, writerDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';
import { loadStagedPlan } from '@modules/refinement/staged-plan';
import { WriterPreviewService } from '@modules/refinement/writer-preview.service';

import {
  ENDING,
  ENDING_QUESTION,
  KEY,
  OPEN_QUESTION,
  PAYLOAD,
  type Scenario,
  TERM,
  TIMELINE_LINE,
  TRUTH,
  V2_GOAL,
  V3_GOAL,
  writerAssembler,
  writerDb,
  writerTables,
} from '../ai/writer-disclosure-fixtures';

type Row = Record<string, unknown>;

const TIDE_RULE = {
  id: 9n,
  projectId: 7n,
  factKey: 'tide_rule',
  text: 'The tide obeys the lamp.',
  constraintNote: null,
  writerNote: null,
  terms: [],
  revealChapter: null,
  unlock: { all: [{ volume: 'v2' }] },
  allowedClues: null,
  source: 'manual',
  plannedChapter: null,
};

function project(card: Row, options: { proposal?: Row; scenario?: Scenario; facts?: Row[] } = {}) {
  const tables = writerTables(options.scenario ?? 'locked');
  const row: Row = { id: 50n, projectId: 7n, kind: 'chapter_plan', status: 'pending', changeSet: [{ op: 'brief.update', chapter: 5, ...card }], ...options.proposal };
  tables.set('refinementProposals', [row]);
  tables.get('canonFacts')?.push(...(options.facts ?? []));
  const db = writerDb(tables);
  return { db, row, service: new WriterPreviewService({ getPostgresClient: () => db } as never, writerAssembler(db)) };
}

const keys = (items: readonly { key: string }[]): string[] => items.map(item => item.key);
const factKeys = (items: readonly { factKey: string }[]): string[] => items.map(item => item.factKey);

describe('WriterPreviewService', () => {
  it('should list what the writer reads and what it is kept from, by name alone', async () => {
    const preview = await project({ body: 'Open on the pier.' }).service.preview(7n, 50n);

    expect(preview.included.map(item => item.ref)).toEqual([
      'entity:keeper',
      'entity:apprentice',
      'world_fact:lamps',
      'thread:harbour_debt',
      'mystery:lamp_builder',
      'chapter:4',
      'volume:v1',
      'fact:harbour_rule',
      'bible_doc:lore/harbour-notes',
    ]);
    expect(preview.included).toContainEqual({ ref: 'chapter:4', label: 'Chapter 4: The [withheld]' });
    expect(preview.unresolved).toEqual([{ ref: 'entity:ghost', label: 'Ghost' }]);
    expect(preview.kept).toEqual([
      { kind: 'secret', key: `fact:${KEY}`, label: 'Lamp memory price', coverNote: "Keep the lamp's price off the page. [withheld]." },
      { kind: 'ending', key: 'ending', label: 'The ending' },
      { kind: 'ending_question', key: 'ending_question', label: 'The ending question' },
      { kind: 'volume', key: 'volume:v2', label: 'Summer' },
      { kind: 'volume', key: 'volume:v3', label: 'Winter' },
      { kind: 'planner_page', key: 'bible_doc:project/timeline', label: 'Timeline' },
      { kind: 'planner_page', key: 'bible_doc:project/open-questions', label: 'Open questions' },
      { kind: 'ref', key: 'chapter:7', label: 'Chapter 7' },
      { kind: 'ref', key: 'bible_doc:story_state/volume-plan', label: 'Volume plan' },
      { kind: 'ref', key: 'thread:winter_debt', label: 'Winter debt' },
    ]);
    expect([preview.unlocks, preview.relocks]).toEqual([[], []]);
    const wire = JSON.stringify(preview, (_, value) => (typeof value === 'bigint' ? String(value) : value));
    for (const secret of [TRUTH, TERM, ENDING, ENDING_QUESTION, V2_GOAL, V3_GOAL, TIMELINE_LINE, OPEN_QUESTION]) expect(wire).not.toContain(secret);
  });

  it('should list a cited locked secret among what the writer reads, as a writing constraint, and not also as kept', async () => {
    const preview = await project({ contextRefs: [`fact:${KEY}`] }).service.preview(7n, 50n);

    expect(preview.included).toContainEqual({ ref: `fact:${KEY}`, label: 'Lamp memory price', constraint: true });
    expect(keys(preview.kept)).not.toContain(`fact:${KEY}`);
  });

  it('should scrub a kept name as the writer’s headings are scrubbed', async () => {
    const { db, service } = project({ contextRefs: ['chapter:7'] });
    (await db.query.volumes?.findMany())?.forEach(volume => Object.assign(volume, volume['volumeKey'] === 'v2' ? { title: `The ${TERM}` } : {}));

    const preview = await service.preview(7n, 50n);

    expect(preview.kept).toContainEqual({ kind: 'volume', key: 'volume:v2', label: 'The [withheld]' });
  });

  it('should report what a claimed milestone unlocks against the stored plan, and that the reveal rule then allows it', async () => {
    const preview = await project({ claimedMilestones: ['lamp_rank'] }).service.preview(7n, 50n);

    expect(preview.unlocks).toEqual([{ factKey: KEY, label: 'Lamp memory price', conditions: ['milestone lamp_rank reached'], revealRuleAllows: true }]);
    expect(preview.relocks).toEqual([]);
    expect(keys(preview.kept)).not.toContain(`fact:${KEY}`);
  });

  it('should report nothing for a card that keeps the claims the stored plan already makes', async () => {
    const preview = await project({ body: 'A new opening.' }, { scenario: 'unlocked' }).service.preview(7n, 50n);

    expect([preview.unlocks, preview.relocks]).toEqual([[], []]);
  });

  it('should report a re-lock when the card drops a claim the stored plan makes', async () => {
    const preview = await project({ claimedMilestones: [] }, { scenario: 'unlocked' }).service.preview(7n, 50n);

    expect(factKeys(preview.relocks)).toEqual([KEY]);
    expect(preview.relocks[0]?.revealRuleAllows).toBe(false);
    expect(keys(preview.kept)).toContain(`fact:${KEY}`);
  });

  it('should keep the ending from the writer again when the card un-marks a stored ending', async () => {
    const preview = await project({ isEnding: false }, { scenario: 'unlocked' }).service.preview(7n, 50n);

    expect(keys(preview.kept)).toEqual(expect.arrayContaining(['ending', 'ending_question']));
  });

  it('should hand the writer the ending once the card plans the chapter as the ending', async () => {
    const preview = await project({ isEnding: true }).service.preview(7n, 50n);

    expect(keys(preview.kept)).not.toContain('ending');
    expect(keys(preview.kept)).not.toContain('ending_question');
  });

  it('should count a move to another volume: it unlocks what that volume gates and stops keeping that volume', async () => {
    const preview = await project({ volumeKey: 'v2' }, { facts: [TIDE_RULE] }).service.preview(7n, 50n);

    expect(factKeys(preview.unlocks)).toEqual(['tide_rule']);
    expect(keys(preview.kept)).not.toContain('volume:v2');
    expect(keys(preview.kept)).toContain('volume:v3');
  });

  it('should read the card as it stands after an edit', async () => {
    const { row, service } = project({ body: 'Open on the pier.' });
    row['changeSet'] = [{ op: 'brief.update', chapter: 5, claimedMilestones: ['lamp_rank'] }];

    expect(factKeys((await service.preview(7n, 50n)).unlocks)).toEqual([KEY]);
  });

  it('should refuse a card that is settled or is not a chapter plan', async () => {
    await expect(project({}, { proposal: { status: 'applied' } }).service.preview(7n, 50n)).rejects.toMatchObject({ code: 'RFN_013' });
    await expect(project({}, { proposal: { kind: 'chat' } }).service.preview(7n, 50n)).rejects.toMatchObject({ code: 'RFN_013' });
    await expect(project({}).service.preview(7n, 51n)).rejects.toMatchObject({ code: 'RFN_001' });
  });
});

describe('loadWriterDisclosureSources', () => {
  it.each(['locked', 'unlocked'] as const)('should withhold the same with a card that changes nothing as with the stored plan (%s)', async scenario => {
    const db = writerDb(writerTables(scenario));
    const stored = await loadWriterDisclosureSources(db as never, 7n, 5);
    const staged = await loadWriterDisclosureSources(db as never, 7n, 5, await loadStagedPlan(db as never, 7n, { op: 'brief.update', chapter: 5 }));

    expect(staged).toEqual(stored);
    expect(writerDisclosurePolicy(staged).scrub(PAYLOAD, 'bible_page')).toBe(writerDisclosurePolicy(stored).scrub(PAYLOAD, 'bible_page'));
  });
});
