/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode, guardedProject, newProject } from './forge-arrange';
import { computeBibleDocHash, ForgeArrangeError, insertChapterRow, insertRawBibleDoc, readBibleDocRow, readChapterFlags, readProposalRow } from './forge-bible';
import { assertSpendGuarded, listDispatchedModelCalls } from './forge-db';
import { expectStatus } from './forge-helpers';

/**
 * Defining types
 */

interface BibleDocResponse {
  section: string;
  slug: string;
  frontmatter: Record<string, unknown> | null;
  body: string | null;
  writerExcluded: boolean;
  plannerOnly: boolean;
}

interface TidyItem {
  id: string;
  kind: 'remove_empty' | 'retitle' | 'split' | 'move_ai_notes';
  section: string;
  slug: string;
}

interface BibleReadinessResponse {
  readyToDraft: boolean;
  blockingGaps: string[];
  roles?: { stage: string; covered: boolean }[];
}

interface WorkflowRunResponse {
  runId: string;
  outcome: string;
  status: string;
  skippedStages?: string[];
}

interface WorkflowRunDetail {
  nodeTrace?: string[] | null;
  skippedStages: string[];
}

const BIBLE_STAGE_DOCS: readonly [string, string][] = [
  ['project', 'premise'],
  ['world', 'setting-overview'],
  ['power', 'system-and-limits'],
  ['world', 'factions-and-locations'],
  ['project', 'cast'],
  ['plot', 'escalation-map'],
  ['story_state', 'volume-plan'],
];

async function getDoc(ctx: APIRequestContext, projectId: string, section: string, slug: string) {
  return ctx.get(`/api/v1/projects/${projectId}/bible/${section}/${slug}`);
}

async function putDoc(ctx: APIRequestContext, projectId: string, section: string, slug: string, body: { frontmatter?: Record<string, unknown>; body?: string }) {
  return mutate(ctx, 'put', `/api/v1/projects/${projectId}/bible/${section}/${slug}`, { data: body });
}

/**
 * Declaring the constants
 *
 * Story Bible documents, tidy-up and the bible builder's skip path (NF2-BIBDOC-01, NF2-TIDY-01, NF2-BIB-01) — NF2-AUD-01
 * lives in notebook.spec.ts. Every tidy proposal is a pure content-op card — not model-capable — so only the bible
 * builder run itself (a genuinely model-capable route, driven entirely through a pre-populated skip-everything run)
 * needs the spend guards.
 */

test.describe('novel-forge Story Bible documents', () => {
  test('should bump revision only on a real content change, fold a derived title without one, and flag chapters validated against the prior canon', async ({ forge }) => {
    const owner = await forge.actor({ label: 'bibdoc' });
    const projectId = await newProject(owner, 'bibdoc');

    await insertChapterRow({ projectId, number: 1, needsRevalidation: false, content: 'A chapter that leans on world/fresh-doc for its setting.' });

    const prefoldBody = 'Prose with no heading at all, written before title derivation existed.';
    await insertRawBibleDoc(projectId, 'world', 'prefold-test', { frontmatter: null, body: prefoldBody, contentHash: computeBibleDocHash(null, prefoldBody), revision: 1 });
    const foldOnly = await putDoc(owner.ctx, projectId, 'world', 'prefold-test', { body: prefoldBody });
    expect(foldOnly.status(), await foldOnly.text()).toBe(200);
    const afterFold = await readBibleDocRow(projectId, 'world', 'prefold-test');
    expect(afterFold?.revision, 'a title fold alone is not a content change').toBe(1);
    expect((afterFold?.frontmatter as { title?: string } | null)?.title).toBe('Prefold test');
    expect((await readChapterFlags(projectId, 1))?.needsRevalidation, 'a title-fold-only write never flags chapters').toBe(false);

    const created = await putDoc(owner.ctx, projectId, 'world', 'fresh-doc', { body: '# Fresh Heading\nSome real content that did not exist before this write.' });
    expect(created.status(), await created.text()).toBe(200);
    const createdBody = (await created.json()) as BibleDocResponse;
    expect(createdBody).toMatchObject({ section: 'world', slug: 'fresh-doc', writerExcluded: false, plannerOnly: false });
    expect(createdBody.frontmatter, 'no authored title, so it derives from the first "# " heading').toMatchObject({ title: 'Fresh Heading' });
    const afterCreate = await readBibleDocRow(projectId, 'world', 'fresh-doc');
    expect(afterCreate?.revision, 'the first write of a document is always a real change').toBe(1);
    expect(
      (await readChapterFlags(projectId, 1))?.needsRevalidation,
      'a real change flags chapters validated against the prior canon, even one whose content merely references the edited page',
    ).toBe(true);

    const beforeIdentical = await readBibleDocRow(projectId, 'world', 'fresh-doc');
    const identical = await putDoc(owner.ctx, projectId, 'world', 'fresh-doc', { body: '# Fresh Heading\nSome real content that did not exist before this write.' });
    expect(identical.status(), await identical.text()).toBe(200);
    const afterIdentical = await readBibleDocRow(projectId, 'world', 'fresh-doc');
    expect(afterIdentical?.revision, 'an identical PUT never writes').toBe(1);
    expect(afterIdentical?.updatedAt.getTime()).toBe(beforeIdentical?.updatedAt.getTime());

    const changed = await putDoc(owner.ctx, projectId, 'world', 'fresh-doc', { body: '# Fresh Heading\nThe content changed for real this time, with new words.' });
    expect(changed.status(), await changed.text()).toBe(200);
    expect((await readBibleDocRow(projectId, 'world', 'fresh-doc'))?.revision).toBe(2);

    // An authored title is kept exactly, never replaced by the body's own heading.
    const authored = await putDoc(owner.ctx, projectId, 'world', 'authored-title', { frontmatter: { title: 'The Author Chose This' }, body: '# A Different Heading Entirely' });
    expect(authored.status(), await authored.text()).toBe(200);
    expect((await authored.json()) as BibleDocResponse).toMatchObject({ frontmatter: { title: 'The Author Chose This' } });

    await expectCode(await getDoc(owner.ctx, projectId, 'world', 'no-such-slug'), 404, 'DOC_001', 'reading a missing bible document');
  });

  test('should mark the organised timeline and open questions as planner-only and writer-excluded, unlike an ordinary page', async ({ forge }) => {
    const owner = await forge.actor({ label: 'bibdoc-access' });
    const projectId = await newProject(owner, 'bibdoc-access');

    const timeline = await putDoc(owner.ctx, projectId, 'project', 'timeline', { body: 'Chapter 1: the delta floods.' });
    expect((await timeline.json()) as BibleDocResponse).toMatchObject({ writerExcluded: true, plannerOnly: true });

    const openQuestions = await putDoc(owner.ctx, projectId, 'project', 'open-questions', { body: 'Who moved the district east?' });
    expect((await openQuestions.json()) as BibleDocResponse).toMatchObject({ writerExcluded: true, plannerOnly: true });

    const ordinary = await putDoc(owner.ctx, projectId, 'world', 'geography', { body: 'The delta empties into a cold northern sea.' });
    expect((await ordinary.json()) as BibleDocResponse).toMatchObject({ writerExcluded: false, plannerOnly: false });
  });

  test('should report a brand-new project as not ready to draft, with every bible role uncovered', async ({ forge }) => {
    const owner = await forge.actor({ label: 'bibdoc-readiness' });
    const projectId = await newProject(owner, 'bibdoc-readiness');

    const readiness = await owner.ctx.get(`/api/v1/projects/${projectId}/bible/readiness`);
    expect(readiness.status(), await readiness.text()).toBe(200);
    const body = (await readiness.json()) as BibleReadinessResponse;
    expect(body.readyToDraft).toBe(false);
    expect(body.blockingGaps.length).toBeGreaterThan(0);
    expect(body.roles?.length).toBe(7);
    expect(body.roles?.every(role => role.covered === false)).toBe(true);
  });
});

test.describe('novel-forge Story Bible tidy', () => {
  test('should preview tidy items deterministically, apply a subset, revert them, and refuse a stale selection', async ({ forge }) => {
    const owner = await forge.actor({ label: 'tidy' });
    const projectId = await newProject(owner, 'tidy');
    const base = `/api/v1/projects/${projectId}/bible/tidy`;

    await putDoc(owner.ctx, projectId, 'world', 'default', { body: '' });
    await putDoc(owner.ctx, projectId, 'world', 'old-name', { frontmatter: { title: 'old-name' }, body: '# New Heading\nSome content about this page, freshly written.' });
    await putDoc(owner.ctx, projectId, 'world', 'notes-doc', {
      body: [
        '# Setting Notes',
        'The city sits on a delta and floods every spring, which shapes how its districts are built.',
        '',
        '## Notes for the AI',
        'Keep the writerNote field consistent with the constraintNote across chapters.',
        '',
      ].join('\n'),
    });
    await putDoc(owner.ctx, projectId, 'project', 'cast', {
      body: [
        '# Cast of Characters',
        '',
        'Some overview text about the protagonists gathered here for the reader.',
        '',
        '## Tamsin Vale',
        '',
        'A careful surveyor who distrusts anything she cannot measure.',
        '',
        '## Odo Kessling',
        '',
        'A guild assessor who wants the district sealed before it is mapped.',
        '',
        '## Mira Harlow',
        '',
        'An old lighthouse keeper who remembers when the delta still had a name.',
        '',
      ].join('\n'),
    });

    const firstPreview = await owner.ctx.get(base);
    expect(firstPreview.status(), await firstPreview.text()).toBe(200);
    const firstItems = ((await firstPreview.json()) as { items: TidyItem[] }).items;
    const byKind = (kind: TidyItem['kind']): TidyItem[] => firstItems.filter(item => item.kind === kind);
    // Every other bible section (project, power, plot, ai, lore) also starts with its own empty `default` placeholder doc,
    // so `remove_empty` candidates exist project-wide; only `world/default` is the one this test wrote and cares about.
    const worldDefaultRemoval = byKind('remove_empty').find(item => item.section === 'world' && item.slug === 'default');
    expect(worldDefaultRemoval, 'the empty world/default doc this test wrote is offered for removal').toBeDefined();
    expect(byKind('retitle')).toHaveLength(1);
    expect(byKind('move_ai_notes').length).toBeGreaterThanOrEqual(1);
    expect(byKind('split')).toHaveLength(3);
    const castIndex = firstItems.findIndex(item => item.section === 'project' && item.slug === 'cast');
    const worldDefaultIndex = firstItems.findIndex(item => item.section === 'world' && item.slug === 'default');
    expect(castIndex, 'docs are previewed in (section, slug) order — project sorts before world').toBeLessThan(worldDefaultIndex);

    const removeEmptyId = (worldDefaultRemoval as TidyItem).id;
    const retitleId = (byKind('retitle')[0] as TidyItem).id;
    const applied = await mutate(owner.ctx, 'post', base, { data: { items: [{ id: removeEmptyId }, { id: retitleId }] } });
    expect(applied.status(), await applied.text()).toBe(200);
    const proposalId = ((await applied.json()) as { proposal: { id: string } }).proposal.id;
    expect(await readProposalRow(proposalId)).toMatchObject({ status: 'applied' });

    await expectCode(await getDoc(owner.ctx, projectId, 'world', 'default'), 404, 'DOC_001', 'the empty placeholder tidy removed');
    const retitled = await getDoc(owner.ctx, projectId, 'world', 'old-name');
    expect(((await retitled.json()) as { frontmatter: { title: string } }).frontmatter.title).toBe('New Heading');

    const secondPreview = (await (await owner.ctx.get(base)).json()) as { items: TidyItem[] };
    expect(
      secondPreview.items.some(item => item.kind === 'move_ai_notes'),
      'an unselected item reappears on the next preview',
    ).toBe(true);
    expect(
      secondPreview.items.some(item => item.kind === 'split'),
      'unselected split items reappear too',
    ).toBe(true);

    const reverted = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/revert`);
    await expectStatus(reverted, 200, 'reverting a tidy apply');
    expect(await readProposalRow(proposalId)).toMatchObject({ status: 'reverted' });
    const restoredEmpty = await getDoc(owner.ctx, projectId, 'world', 'default');
    expect(restoredEmpty.status(), 'revert restores the removed placeholder').toBe(200);
    const restoredTitle = await getDoc(owner.ctx, projectId, 'world', 'old-name');
    expect(((await restoredTitle.json()) as { frontmatter: { title: string } }).frontmatter.title).toBe('old-name');

    const thirdPreview = (await (await owner.ctx.get(base)).json()) as { items: TidyItem[] };
    const splitItem = thirdPreview.items.find(item => item.kind === 'split');
    if (!splitItem) throw new ForgeArrangeError('expected a split candidate to still be on preview');
    const dupApplied = await mutate(owner.ctx, 'post', base, { data: { items: [{ id: splitItem.id }, { id: splitItem.id }] } });
    expect(dupApplied.status(), await dupApplied.text()).toBe(200);
    const dupProposalId = ((await dupApplied.json()) as { proposal: { id: string } }).proposal.id;
    const dupRow = await readProposalRow(dupProposalId);
    expect(dupRow?.changeSet, 'a duplicate id in one tidy apply is deduplicated to one op').toHaveLength(1);

    const beforeStale = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM refinement_proposals WHERE project_id = ${projectId} AND kind = 'bible_audit'`;
    const stale = await mutate(owner.ctx, 'post', base, { data: { items: [{ id: 'remove_empty:world/never-existed' }] } });
    await expectCode(stale, 409, 'DOC_002', 'applying an unknown tidy item id');
    const afterStale = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM refinement_proposals WHERE project_id = ${projectId} AND kind = 'bible_audit'`;
    expect(afterStale[0]?.count, 'a stale-id refusal never creates a card — the analysis rejects it before staging').toBe(beforeStale[0]?.count);
  });
});

test.describe('novel-forge bible builder', () => {
  test('should skip every stage and dispatch no model when all seven stage documents already have content', async ({ forge }) => {
    const owner = await forge.actor({ label: 'bible-builder', roles: ['NovelForgeAdmin'] });
    const projectId = await guardedProject(forge, owner, 'bible-builder');

    for (const [section, slug] of BIBLE_STAGE_DOCS) {
      const written = await putDoc(owner.ctx, projectId, section, slug, {
        body: `# ${slug}\nPre-written content for the ${section}/${slug} stage, so the builder has nothing to add.`,
      });
      expect(written.status(), await written.text()).toBe(200);
    }

    await assertSpendGuarded(projectId, { requireQuota: true });
    const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/seed-from-brief`, {
      data: { brief: 'A cartographer maps a district that moves one street east every night.', force: false },
    });
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as WorkflowRunResponse;
    const allStages = new Set(['foundation', 'world', 'power', 'factionsAndLocations', 'characters', 'plot', 'volumes']);
    expect(new Set(body.skippedStages)).toEqual(allStages);
    expect(body.status).toBe('completed');

    // Author-facing list also reports `skippedStages` on the run summary.
    const list = await owner.ctx.get(`/api/v1/projects/${projectId}/runs?graph=bible-builder`);
    expect(list.status(), await list.text()).toBe(200);
    const listedRun = ((await list.json()) as { items: { id: string; skippedStages: string[] }[] }).items.find(item => item.id === body.runId);
    expect(new Set(listedRun?.skippedStages)).toEqual(allStages);

    // Run detail (novel-forge:admin only) carries the persisted node trace — live-verified as the bare stage name per
    // skipped stage (e.g. `"foundation"`), not a `skipped:<stage>`-prefixed one; `skippedStages` above is the field that
    // actually distinguishes a skip from a stage that ran.
    const detail = await owner.ctx.get(`/api/v1/projects/${projectId}/runs/${body.runId}`);
    expect(detail.status(), await detail.text()).toBe(200);
    const detailBody = (await detail.json()) as WorkflowRunDetail;
    for (const stage of allStages) expect(detailBody.nodeTrace, `nodeTrace visits ${stage}`).toContain(stage);

    expect(await listDispatchedModelCalls(projectId), 'every stage skipped means no LLM was dispatched').toEqual([]);
    const [entityCount] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM entities WHERE project_id = ${projectId}`;
    expect(entityCount?.count, 'an all-skipped run writes no entity rows').toBe(0);
    const [factCount] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM canon_facts WHERE project_id = ${projectId}`;
    expect(factCount?.count, 'an all-skipped run writes no canon_facts rows').toBe(0);
  });
});
