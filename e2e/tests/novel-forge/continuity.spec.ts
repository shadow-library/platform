/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { insertChapterRow } from './forge-bible';
import { expectRefusal, readChapterRow } from './forge-review';
import { countKnowledge, createGuardedProject, insertEntities } from './forge-story';

/**
 * Defining types
 */

interface Delta {
  appeared?: string[];
  newEntities?: Record<string, unknown>[];
  relationships?: Record<string, unknown>[];
  characterStates?: Record<string, unknown>[];
  threads?: Record<string, unknown>[];
  mysteries?: Record<string, unknown>[];
  knowledgeChanges?: Record<string, unknown>[];
}

interface ProposalView {
  readonly chapter: number;
  readonly status: string;
  readonly proposal: Required<Delta>;
  readonly appliedAt: string | null;
}

interface RelationshipRow {
  readonly entityKey: string;
  readonly targetKey: string;
  readonly kind: string;
  readonly note: string | null;
  readonly chapter: number | null;
}

interface StateRow {
  readonly location: string | null;
  readonly conditions: string[] | null;
  readonly immediateGoal: string | null;
  readonly statusNote: string | null;
  readonly lastUpdatedChapter: number;
}

interface ThreadRow {
  readonly status: string;
  readonly summary: string | null;
  readonly intentionallyOpen: boolean;
  readonly openedChapter: number | null;
  readonly lastAdvancedChapter: number | null;
}

interface MysteryRow {
  readonly question: string;
  readonly truthFactKey: string | null;
  readonly openedChapter: number | null;
  readonly lastAdvancedChapter: number | null;
}

/**
 * Declaring the constants
 *
 * The manual half of continuity: a proposal is only ever written by the continuity model, so each one here is a crafted delta inserted as
 * the model would have left it, then read, edited, applied and discarded through the API. Nothing in this file reaches a model.
 */

const EMPTY_DELTA = {
  appeared: [],
  newEntities: [],
  relationships: [],
  characterStates: [],
  threads: [],
  mysteries: [],
  knowledgeChanges: [],
  timeline: [],
  power: [],
  chapterSummary: '',
};

const EVIDENCE = 'Quoted from the chapter.';

const CAST = [
  { entityKey: 'mira', name: 'Mira' },
  { entityKey: 'odo', name: 'Odo Kessling' },
];

function proposalPath(projectId: string, chapter: number, suffix = ''): string {
  return `/api/v1/projects/${projectId}/chapters/${chapter}/continuity-proposal${suffix}`;
}

async function insertDelta(projectId: string, chapter: number, delta: Delta): Promise<void> {
  const sql = novelForgeDb();
  await sql`INSERT INTO continuity_proposals (project_id, chapter, status, proposal) VALUES (${projectId}, ${chapter}, 'pending', ${sql.json({ ...EMPTY_DELTA, ...delta } as never)})`;
}

async function expectProposal(response: APIResponse, what: string): Promise<ProposalView> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(200);
  return (await response.json()) as ProposalView;
}

function apply(owner: ForgeActor, projectId: string, chapter: number): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', proposalPath(projectId, chapter, '/apply'));
}

async function readRelationships(projectId: string): Promise<RelationshipRow[]> {
  return novelForgeDb()<RelationshipRow[]>`
    SELECT e.entity_key AS "entityKey", r.target_key AS "targetKey", r.kind, r.note, r.chapter
    FROM entity_relationships r JOIN entities e ON e.id = r.entity_id WHERE r.project_id = ${projectId} ORDER BY r.chapter, r.kind
  `;
}

async function readState(projectId: string, entityKey: string): Promise<StateRow | undefined> {
  const [row] = await novelForgeDb()<StateRow[]>`
    SELECT location, conditions, immediate_goal AS "immediateGoal", status_note AS "statusNote", last_updated_chapter AS "lastUpdatedChapter"
    FROM character_states WHERE project_id = ${projectId} AND entity_key = ${entityKey}
  `;
  return row;
}

async function countStates(projectId: string): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM character_states WHERE project_id = ${projectId}`;
  return row?.count ?? 0;
}

async function readThread(projectId: string, threadKey: string): Promise<ThreadRow | undefined> {
  const [row] = await novelForgeDb()<ThreadRow[]>`
    SELECT status, summary, intentionally_open AS "intentionallyOpen", opened_chapter AS "openedChapter", last_advanced_chapter AS "lastAdvancedChapter"
    FROM plot_threads WHERE project_id = ${projectId} AND thread_key = ${threadKey}
  `;
  return row;
}

async function readMystery(projectId: string, mysteryKey: string): Promise<MysteryRow | undefined> {
  const [row] = await novelForgeDb()<MysteryRow[]>`
    SELECT question, truth_fact_key AS "truthFactKey", opened_chapter AS "openedChapter", last_advanced_chapter AS "lastAdvancedChapter"
    FROM mysteries WHERE project_id = ${projectId} AND mystery_key = ${mysteryKey}
  `;
  return row;
}

async function readAppearances(projectId: string): Promise<{ entityKey: string; chapter: number; firstChapter: number | null; lastChapter: number | null }[]> {
  return novelForgeDb()<{ entityKey: string; chapter: number; firstChapter: number | null; lastChapter: number | null }[]>`
    SELECT e.entity_key AS "entityKey", a.chapter, a.first_chapter AS "firstChapter", a.last_chapter AS "lastChapter"
    FROM entity_appearances a JOIN entities e ON e.id = a.entity_id WHERE a.project_id = ${projectId} ORDER BY e.entity_key, a.chapter
  `;
}

async function arrangeCanon(forgeProject: () => Promise<string>, chapters: readonly number[]): Promise<string> {
  const projectId = await forgeProject();
  await insertEntities(projectId, CAST);
  for (const number of chapters) await insertChapterRow({ projectId, number });
  return projectId;
}

test.describe('novel-forge continuity proposals', () => {
  test('should answer CNT_001 on every route while nothing is pending, and discard a pending proposal without applying it', async ({ forge }) => {
    const owner = await forge.actor({ label: 'cnt-none' });
    const projectId = await createGuardedProject(forge, owner, 'cnt-none');

    await expectRefusal(await owner.ctx.get(proposalPath(projectId, 1)), 404, 'CNT_001', 'reading a proposal that does not exist');
    await expectRefusal(await mutate(owner.ctx, 'patch', proposalPath(projectId, 1), { data: { proposal: EMPTY_DELTA } }), 404, 'CNT_001', 'editing it');
    await expectRefusal(await apply(owner, projectId, 1), 404, 'CNT_001', 'applying it');
    await expectRefusal(await mutate(owner.ctx, 'post', proposalPath(projectId, 1, '/discard')), 404, 'CNT_001', 'discarding it');

    await insertDelta(projectId, 1, { threads: [{ threadKey: 'e2e-discarded', status: 'open', summary: 'Never canon.' }] });
    expect((await expectProposal(await owner.ctx.get(proposalPath(projectId, 1)), 'reading the pending proposal')).status).toBe('pending');
    const discarded = await expectProposal(await mutate(owner.ctx, 'post', proposalPath(projectId, 1, '/discard')), 'discarding the pending proposal');
    expect(discarded.status).toBe('discarded');
    await expectRefusal(await owner.ctx.get(proposalPath(projectId, 1)), 404, 'CNT_001', 'reading a discarded proposal');
    await expectRefusal(await apply(owner, projectId, 1), 404, 'CNT_001', 'applying a discarded proposal');
    expect(await readThread(projectId, 'e2e-discarded'), 'a discarded proposal writes nothing').toBeUndefined();
  });

  test('should apply an edited delta into canon, skip keys it cannot resolve, replace snapshots wholesale, and never write the knowledge ledger', async ({ forge }) => {
    const owner = await forge.actor({ label: 'cnt-apply' });
    const projectId = await arrangeCanon(() => createGuardedProject(forge, owner, 'cnt-apply'), [1, 2]);
    await novelForgeDb()`INSERT INTO canon_facts (project_id, fact_key, text) VALUES (${projectId}, 'wall_is_alive', 'The wall is alive.')`;
    await novelForgeDb()`
      INSERT INTO plot_threads (project_id, thread_key, status, opened_chapter, summary, intentionally_open)
      VALUES (${projectId}, 'e2e-dropped', 'dropped', 1, 'The author dropped this.', true)
    `;
    await insertDelta(projectId, 1, {
      appeared: ['mira', 'ghost'],
      relationships: [
        { entityKey: 'mira', targetKey: 'odo', kind: 'rival', note: 'Guild rivalry', evidence: EVIDENCE },
        { entityKey: 'mira', targetKey: 'ghost', kind: 'ally', evidence: EVIDENCE },
        { entityKey: 'ghost', targetKey: 'odo', kind: 'foe', evidence: EVIDENCE },
      ],
      characterStates: [
        { entityKey: 'mira', location: 'Harbour', conditions: ['wounded'], immediateGoal: 'Map the district', statusNote: 'Tired', evidence: EVIDENCE },
        { entityKey: 'ghost', location: 'Nowhere', evidence: EVIDENCE },
      ],
      threads: [
        { threadKey: 'e2e-map', status: 'open', summary: 'The map of the moving district.' },
        { threadKey: 'e2e-dropped', status: 'open', summary: 'Reopened by the extractor.', intentionallyOpen: false },
      ],
      mysteries: [{ mysteryKey: 'e2e-wall', status: 'open', question: 'What moves the wall?', truthFactKey: 'wall_is_alive' }],
      knowledgeChanges: [{ entityKey: 'mira', factKey: 'wall_is_alive', how: 'She touched it.' }],
    });

    const pending = await expectProposal(await owner.ctx.get(proposalPath(projectId, 1)), 'reading the pending proposal');
    const relationships = pending.proposal.relationships.map((relationship, index) => (index === 0 ? { ...relationship, note: 'An old guild rivalry' } : relationship));
    const edited = await expectProposal(await mutate(owner.ctx, 'patch', proposalPath(projectId, 1), { data: { proposal: { ...pending.proposal, relationships } } }), 'editing it');
    expect(edited).toMatchObject({ status: 'pending', proposal: { relationships: [{ note: 'An old guild rivalry' }, {}, {}] } });

    const applied = await expectProposal(await apply(owner, projectId, 1), 'applying the edited proposal');
    expect(applied).toMatchObject({ status: 'applied', appliedAt: expect.any(String) });
    expect(await readRelationships(projectId), 'the edited relationship persists; edges with an unknown end are skipped').toEqual([
      { entityKey: 'mira', targetKey: 'odo', kind: 'rival', note: 'An old guild rivalry', chapter: 1 },
    ]);
    expect(await readState(projectId, 'mira')).toEqual({
      location: 'Harbour',
      conditions: ['wounded'],
      immediateGoal: 'Map the district',
      statusNote: 'Tired',
      lastUpdatedChapter: 1,
    });
    expect(await countStates(projectId), 'no snapshot for an entity that does not exist').toBe(1);
    expect(await readAppearances(projectId)).toEqual([{ entityKey: 'mira', chapter: 1, firstChapter: 1, lastChapter: 1 }]);
    expect(await readThread(projectId, 'e2e-map')).toMatchObject({ status: 'open', openedChapter: 1, lastAdvancedChapter: 1 });
    expect(await readThread(projectId, 'e2e-dropped'), 'the author’s drop and dormancy stand').toMatchObject({ status: 'dropped', intentionallyOpen: true });
    expect(await readMystery(projectId, 'e2e-wall')).toMatchObject({ truthFactKey: 'wall_is_alive', openedChapter: 1, lastAdvancedChapter: 1 });
    expect(await countKnowledge(projectId), 'knowledge changes stay on the proposal, never in the ledger').toBe(0);
    expect((await readChapterRow(projectId, 1))?.continuityApplied).toBe(true);
    await expectRefusal(await apply(owner, projectId, 1), 404, 'CNT_001', 're-applying a fully applied proposal');

    await insertDelta(projectId, 2, {
      appeared: ['mira'],
      characterStates: [{ entityKey: 'mira', location: 'Tower', evidence: EVIDENCE }],
      threads: [{ threadKey: 'e2e-map', status: 'open' }],
      mysteries: [{ mysteryKey: 'e2e-wall', status: 'open' }],
    });
    expect((await expectProposal(await apply(owner, projectId, 2), 'applying the next chapter')).status).toBe('applied');
    expect(await readState(projectId, 'mira'), 'a later snapshot replaces every field, clearing the ones it omits').toEqual({
      location: 'Tower',
      conditions: null,
      immediateGoal: null,
      statusNote: null,
      lastUpdatedChapter: 2,
    });
    expect(await readThread(projectId, 'e2e-map'), 'a re-mention advances the thread without moving where it opened').toMatchObject({
      summary: 'The map of the moving district.',
      openedChapter: 1,
      lastAdvancedChapter: 2,
    });
    expect(await readMystery(projectId, 'e2e-wall'), 'a delta that omits the truth never clears it').toEqual({
      question: 'What moves the wall?',
      truthFactKey: 'wall_is_alive',
      openedChapter: 1,
      lastAdvancedChapter: 2,
    });
    expect(await readAppearances(projectId)).toEqual([
      { entityKey: 'mira', chapter: 1, firstChapter: 1, lastChapter: 1 },
      { entityKey: 'mira', chapter: 2, firstChapter: 2, lastChapter: 2 },
    ]);
  });

  test('should hold low-confidence entries for review, apply an upgraded one without replaying its siblings, and never rewind a later chapter', async ({ forge }) => {
    const owner = await forge.actor({ label: 'cnt-held' });
    const projectId = await arrangeCanon(() => createGuardedProject(forge, owner, 'cnt-held'), [1, 2]);
    await insertDelta(projectId, 2, {
      relationships: [
        { entityKey: 'mira', targetKey: 'odo', kind: 'ally', evidence: EVIDENCE, confidence: 'low' },
        { entityKey: 'mira', targetKey: 'odo', kind: 'rival', evidence: EVIDENCE },
      ],
      threads: [
        { threadKey: 'e2e-held', status: 'open', summary: 'Inferred, not stated.', confidence: 'low' },
        { threadKey: 'e2e-sure', status: 'open', summary: 'Stated outright.', confidence: 'high' },
      ],
      characterStates: [{ entityKey: 'mira', location: 'Harbour', statusNote: 'Watching', evidence: EVIDENCE }],
    });

    const partial = await expectProposal(await apply(owner, projectId, 2), 'applying a proposal with held entries');
    expect(partial.status, 'a proposal holding entries stays pending').toBe('pending');
    expect(partial.proposal.threads.map(thread => thread.threadKey)).toEqual(['e2e-held']);
    expect(partial.proposal.relationships.map(relationship => relationship.kind)).toEqual(['ally']);
    expect(partial.proposal.characterStates, 'applied siblings leave the proposal').toEqual([]);
    expect(
      (await readRelationships(projectId)).map(row => row.kind),
      'the entry without a confidence applied as it always has',
    ).toEqual(['rival']);
    expect(await readThread(projectId, 'e2e-sure')).toMatchObject({ lastAdvancedChapter: 2 });
    expect(await readThread(projectId, 'e2e-held'), 'the low-confidence thread waits').toBeUndefined();

    await novelForgeDb()`UPDATE character_states SET status_note = 'The author corrected this.' WHERE project_id = ${projectId} AND entity_key = 'mira'`;
    const held = await expectProposal(await owner.ctx.get(proposalPath(projectId, 2)), 'reading what is held');
    const upgraded = {
      ...held.proposal,
      threads: held.proposal.threads.map(thread => ({ ...thread, confidence: 'high' })),
      relationships: held.proposal.relationships.map(relationship => ({ ...relationship, confidence: 'high' })),
    };
    await expectProposal(await mutate(owner.ctx, 'patch', proposalPath(projectId, 2), { data: { proposal: upgraded } }), 'upgrading the held entries');
    expect((await expectProposal(await apply(owner, projectId, 2), 'applying the upgraded entries')).status).toBe('applied');
    expect(await readThread(projectId, 'e2e-held')).toMatchObject({ openedChapter: 2, lastAdvancedChapter: 2 });
    expect((await readRelationships(projectId)).map(row => row.kind).sort()).toEqual(['ally', 'rival']);
    expect((await readState(projectId, 'mira'))?.statusNote, 'the siblings applied earlier were not replayed over the author’s edit').toBe('The author corrected this.');
    await expectRefusal(await apply(owner, projectId, 2), 404, 'CNT_001', 're-applying the fully applied proposal');

    await insertDelta(projectId, 1, {
      threads: [{ threadKey: 'e2e-sure', status: 'closed', summary: 'Closed in an earlier chapter.' }],
      characterStates: [{ entityKey: 'mira', location: 'Old Town', evidence: EVIDENCE }],
    });
    expect((await expectProposal(await apply(owner, projectId, 1), 'applying an earlier chapter late')).status).toBe('applied');
    expect(await readThread(projectId, 'e2e-sure'), 'a late earlier chapter never rewinds a thread').toMatchObject({ status: 'open', lastAdvancedChapter: 2 });
    expect(await readState(projectId, 'mira'), 'nor a snapshot').toMatchObject({ location: 'Harbour', lastUpdatedChapter: 2 });
  });
});
