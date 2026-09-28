/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { holdAuthoringClaim, insertContextPack, insertModelCalls, releaseAuthoringClaim } from './forge-db';
import { CHAPTER_TWO, expectCommittedDespiteSerializerBug, writeChapterByHand } from './forge-helpers';
import { createGuardedProject, insertEntities, insertFinalDraft, insertVolumes, insertWorldFacts, readStaleDraft } from './forge-story';

/**
 * Defining types
 */

interface BriefRow {
  readonly chapter: number;
  readonly volumeKey: string | null;
  readonly body: string;
  readonly contextRefs: string[] | null;
  readonly knowledgeContract: Record<string, unknown> | null;
  readonly writeMode: string;
  readonly handEdited: boolean;
  readonly insertedAt: Date | null;
}

interface ShiftColumn {
  readonly table: string;
  readonly column: string;
}

/**
 * Declaring the constants
 *
 * A hand-authored chapter insert: every chapter-numbered column above the insert point moves up by one inside one transaction, the briefs
 * it moves are re-rendered against the new numbering, and a verbatim brief lands in the freed slot. The planner mode drafts that brief with
 * a model and stays out of scope. Rows no model-free route writes — plans with cited refs, threads, context packs, model calls — are
 * arranged in the database at chapters below, at and above the insert point.
 */

const HAND_BRIEF = 'Tamsin measures the gap the wall left behind.';

const CONTINUES_LINE = "[CONTINUES INTO NEXT CHAPTER] Do not resolve this chapter's central action/tension.";

const MOVED_BRIEF = ['Picks up from chapter 2 and sets up chapter 4.', 'Recall chs 3-4 before the wall moves.', CONTINUES_LINE, 'Handoff beat: Chapter 4 opens at the wall.'].join(
  '\n',
);

/**
 * `chapter-insert.service.ts` SHIFT_TARGETS as columns, less the three asserted on their own: `briefs.chapter` (it gains the inserted plan) and
 * the two a plan write re-derives at the end of the insert, `canon_facts.planned_chapter` and `milestones.planned_chapter`.
 */
const SHIFTED_COLUMNS: readonly ShiftColumn[] = [
  { table: 'drafts', column: 'chapter' },
  { table: 'chapters', column: 'number' },
  { table: 'chapter_images', column: 'chapter' },
  { table: 'continuity_proposals', column: 'chapter' },
  { table: 'context_packs', column: 'chapter' },
  { table: 'chapter_reviews', column: 'chapter' },
  { table: 'finalize_reviews', column: 'chapter' },
  { table: 'entities', column: 'first_seen_chapter' },
  { table: 'entity_relationships', column: 'chapter' },
  { table: 'entity_appearances', column: 'chapter' },
  { table: 'entity_appearances', column: 'first_chapter' },
  { table: 'entity_appearances', column: 'last_chapter' },
  { table: 'canon_facts', column: 'reveal_chapter' },
  { table: 'character_knowledge', column: 'learned_in_chapter' },
  { table: 'character_states', column: 'last_updated_chapter' },
  { table: 'world_facts', column: 'chapter' },
  { table: 'plot_threads', column: 'opened_chapter' },
  { table: 'plot_threads', column: 'closed_chapter' },
  { table: 'plot_threads', column: 'last_advanced_chapter' },
  { table: 'plot_threads', column: 'payoff_window' },
  { table: 'mysteries', column: 'opened_chapter' },
  { table: 'mysteries', column: 'resolved_chapter' },
  { table: 'mysteries', column: 'last_advanced_chapter' },
  { table: 'mysteries', column: 'payoff_window' },
  { table: 'model_calls', column: 'chapter' },
  { table: 'character_events', column: 'chapter' },
  { table: 'entities', column: 'image_depicts_chapter' },
  { table: 'entity_images', column: 'depicts_chapter' },
  { table: 'illustrations', column: 'depicts_chapter' },
];

function insertChapter(owner: ForgeActor, projectId: string, afterChapter: number, data: Record<string, unknown>): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/${afterChapter}/insert`, { data });
}

async function readBriefs(projectId: string): Promise<BriefRow[]> {
  return novelForgeDb()<BriefRow[]>`
    SELECT chapter, volume_key AS "volumeKey", body, context_refs AS "contextRefs", knowledge_contract AS "knowledgeContract", write_mode AS "writeMode",
           hand_edited AS "handEdited", inserted_at AS "insertedAt"
    FROM briefs WHERE project_id = ${projectId} ORDER BY chapter
  `;
}

/** Every value of every shifted column on the project, nulls first then ascending, so a before/after pair compares as multisets. */
async function readShiftedValues(projectId: string): Promise<Record<string, (number | null)[]>> {
  const sql = novelForgeDb();
  const values: Record<string, (number | null)[]> = {};
  for (const { table, column } of SHIFTED_COLUMNS) {
    const rows = await sql<{ value: number | null }[]>`SELECT ${sql(column)} AS value FROM ${sql(table)} WHERE project_id = ${projectId} ORDER BY ${sql(column)} NULLS FIRST`;
    values[`${table}.${column}`] = rows.map(row => row.value);
  }
  return values;
}

function shiftedAbove(values: Record<string, (number | null)[]>, afterChapter: number): Record<string, (number | null)[]> {
  return Object.fromEntries(Object.entries(values).map(([key, list]) => [key, list.map(value => (value !== null && value > afterChapter ? value + 1 : value))]));
}

async function arrangePlanAndCanon(projectId: string): Promise<void> {
  const sql = novelForgeDb();
  await insertVolumes(projectId, [
    { volumeKey: 'v-one', ordinal: 1 },
    { volumeKey: 'v-two', ordinal: 2 },
  ]);
  const plans = [
    { chapter: 2, volume_key: 'v-one', body: 'Chapter 2 maps the ground the wall left.', context_refs: ['chapter:1'], knowledge_contract: null },
    {
      chapter: 3,
      volume_key: 'v-two',
      body: MOVED_BRIEF,
      context_refs: ['chapter:2', 'chapter:3', 'entity:mira'],
      knowledge_contract: { pov: ['mira'], learns: [], note: 'Mira saw it in chapter 3.' },
    },
    { chapter: 4, volume_key: 'v-two', body: 'Chapter 4 at the wall.', context_refs: null, knowledge_contract: null },
  ];
  for (const plan of plans) {
    await sql`
      INSERT INTO briefs (project_id, chapter, volume_key, body, context_refs, knowledge_contract)
      VALUES (${projectId}, ${plan.chapter}, ${plan.volume_key}, ${plan.body}, ${plan.context_refs ? sql.json(plan.context_refs) : null},
              ${plan.knowledge_contract ? sql.json(plan.knowledge_contract as never) : null})
    `;
  }

  await insertEntities(projectId, [
    { entityKey: 'mira', name: 'Mira' },
    { entityKey: 'odo', name: 'Odo Kessling' },
  ]);
  await sql`UPDATE entities SET first_seen_chapter = CASE entity_key WHEN 'mira' THEN 3 ELSE 2 END WHERE project_id = ${projectId}`;
  const [mira] = await sql<{ id: string }[]>`SELECT id::text FROM entities WHERE project_id = ${projectId} AND entity_key = 'mira'`;
  const miraId = mira?.id ?? '0';
  await sql`
    INSERT INTO entity_appearances (entity_id, project_id, chapter, first_chapter, last_chapter)
    VALUES (${miraId}, ${projectId}, 2, 2, 2), (${miraId}, ${projectId}, 3, 3, 3)
  `;
  await sql`INSERT INTO entity_relationships (project_id, entity_id, target_key, kind, chapter) VALUES (${projectId}, ${miraId}, 'odo', 'rival', 3)`;
  await sql`INSERT INTO character_states (project_id, entity_key, location, last_updated_chapter) VALUES (${projectId}, 'mira', 'Harbour', 3)`;
  await sql`INSERT INTO character_events (project_id, entity_id, chapter, kind) VALUES (${projectId}, ${miraId}, 3, 'appearance'), (${projectId}, ${miraId}, 2, 'state')`;
  const [fact] = await sql<{ id: string }[]>`
    INSERT INTO canon_facts (project_id, fact_key, text, reveal_chapter) VALUES (${projectId}, 'wall_is_alive', 'The wall is alive.', 4) RETURNING id::text
  `;
  await sql`INSERT INTO canon_facts (project_id, fact_key, text) VALUES (${projectId}, 'river_is_old', 'The river is older than the city.')`;
  await sql`
    INSERT INTO character_knowledge (project_id, fact_id, entity_id, learned_in_chapter, source, status)
    VALUES (${projectId}, ${fact?.id ?? '0'}, ${miraId}, 3, 'manual', 'committed')
  `;
  await sql`
    INSERT INTO plot_threads (project_id, thread_key, status, opened_chapter, last_advanced_chapter, payoff_window)
    VALUES (${projectId}, 'e2e-map', 'open', 1, 3, 4), (${projectId}, 'e2e-writ', 'closed', 2, 2, NULL)
  `;
  await sql`
    INSERT INTO mysteries (project_id, mystery_key, question, status, opened_chapter, last_advanced_chapter)
    VALUES (${projectId}, 'e2e-wall', 'What moves the wall?', 'open', 2, 4)
  `;
  await insertWorldFacts(projectId, [
    { category: 'place', key: 'harbour', value: 'Where the survey starts.' },
    { category: 'place', key: 'tower', value: 'Where it ends.' },
  ]);
  await sql`UPDATE world_facts SET chapter = CASE key WHEN 'harbour' THEN 2 ELSE 4 END WHERE project_id = ${projectId}`;
  await sql`INSERT INTO continuity_proposals (project_id, chapter, status, proposal) VALUES (${projectId}, 3, 'pending', ${sql.json({ appeared: [] } as never)})`;
  await sql`INSERT INTO chapter_images (project_id, chapter, image_path) VALUES (${projectId}, 2, 'e2e/below.png'), (${projectId}, 3, 'e2e/above.png')`;
  for (const chapter of [2, 3, null]) await insertContextPack({ projectId, purpose: 'generation', chapter, sections: [], rendered: `pack for ${chapter ?? 'no chapter'}` });
  await insertModelCalls([
    { projectId, chapter: 2, costUsd: 0 },
    { projectId, chapter: 4, costUsd: 0 },
  ]);
}

test.describe('novel-forge chapter insert by hand', () => {
  test('should refuse an insert with no brief, behind the finalized frontier, below a written chapter, past the plan or under a held claim', async ({ forge }) => {
    const owner = await forge.actor({ label: 'insert-refusals' });
    const projectId = await createGuardedProject(forge, owner, 'insert-refusals');
    await insertFinalDraft(projectId, 1);
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_TWO);
    await arrangePlanAndCanon(projectId);
    const briefs = await readBriefs(projectId);
    const shifted = await readShiftedValues(projectId);

    await expectCode(await insertChapter(owner, projectId, 2, { briefOrigin: 'hand' }), 422, 'S003', 'a hand insert without a brief');
    await expectCode(await insertChapter(owner, projectId, 2, { briefOrigin: 'hand', briefBody: '   ' }), 422, 'S003', 'a hand insert with a blank brief');
    await expectCode(await insertChapter(owner, projectId, 2, { briefOrigin: 'planner' }), 422, 'S003', 'a planner insert without an intent');
    await expectCode(await insertChapter(owner, projectId, 0, { briefOrigin: 'hand', briefBody: HAND_BRIEF }), 400, 'CHP_003', 'inserting behind the finalized chapter 1');
    await expectCode(await insertChapter(owner, projectId, 1, { briefOrigin: 'hand', briefBody: HAND_BRIEF }), 409, 'CHP_009', 'inserting below the written chapter 2');
    await expectCode(await insertChapter(owner, projectId, 5, { briefOrigin: 'hand', briefBody: HAND_BRIEF }), 404, 'CHP_001', 'inserting past every plan and chapter');
    await holdAuthoringClaim(projectId);
    await expectCode(await insertChapter(owner, projectId, 2, { briefOrigin: 'hand', briefBody: HAND_BRIEF }), 409, 'CHP_004', 'inserting while another holder has the novel');
    await releaseAuthoringClaim(projectId);

    expect(await readBriefs(projectId), 'no refusal touched a plan').toEqual(briefs);
    expect(await readShiftedValues(projectId), 'or a chapter number').toEqual(shifted);

    const inserted = await insertChapter(owner, projectId, 4, { briefOrigin: 'hand', briefBody: HAND_BRIEF });
    await expectCommittedDespiteSerializerBug(inserted, 200, 'inserting right after the last plan');
    expect(
      (await readBriefs(projectId)).map(brief => brief.chapter),
      'an insert right after the highest plan is allowed',
    ).toEqual([2, 3, 4, 5]);
  });

  test('should move every chapter number above the insert point up by one exactly once and land the brief verbatim in the freed slot', async ({ forge }) => {
    const owner = await forge.actor({ label: 'insert-shift' });
    const projectId = await createGuardedProject(forge, owner, 'insert-shift');
    await insertFinalDraft(projectId, 1);
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_TWO);
    await arrangePlanAndCanon(projectId);
    const [before2] = await readBriefs(projectId);
    const shifted = await readShiftedValues(projectId);
    expect(
      Object.values(shifted)
        .flat()
        .filter(value => value !== null && value > 2).length,
      'rows sit above the insert point to move',
    ).toBeGreaterThan(15);

    const inserted = await insertChapter(owner, projectId, 2, { briefOrigin: 'hand', briefBody: HAND_BRIEF });
    await expectCommittedDespiteSerializerBug(inserted, 200, 'inserting after chapter 2');

    expect(await readShiftedValues(projectId), 'above moves by one, at and below stay, unset stays unset').toEqual(shiftedAbove(shifted, 2));
    const [kept, landed, moved, last] = await readBriefs(projectId);
    expect(kept, 'the plan at the insert point is left byte-identical').toEqual(before2);
    expect(landed).toMatchObject({ chapter: 3, body: HAND_BRIEF, writeMode: 'external', handEdited: true, volumeKey: 'v-one', insertedAt: expect.any(Date) });
    expect(moved).toMatchObject({
      chapter: 4,
      volumeKey: 'v-two',
      body: ['Picks up from chapter 2 and sets up chapter 5.', 'Recall chs 4-5 before the wall moves.', CONTINUES_LINE, 'Handoff beat: Chapter 5 opens at the wall.'].join('\n'),
      contextRefs: ['chapter:2', 'chapter:4', 'entity:mira'],
      knowledgeContract: { pov: ['mira'], learns: [], note: 'Mira saw it in chapter 4.' },
      writeMode: 'standard',
      insertedAt: null,
    });
    expect(last).toMatchObject({ chapter: 5, body: 'Chapter 5 at the wall.' });
    expect((await readStaleDraft(owner.ctx, projectId, 2)).staleReason, 'the draft at the insert point is not a descendant of it').toBeNull();
  });
});
