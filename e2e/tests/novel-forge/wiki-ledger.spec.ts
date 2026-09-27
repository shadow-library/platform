/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { publishForge, publishForgeChapter } from '../web-novel/forge-publication';
import { type ForgeActor } from './forge-actors';
import { buildBundle, countEntities, expect, readServedWikiRows, readWikiLedgerRows, test } from './forge-bundles';
import { type BibleEntity, createEntity, reconcileUntilConverged, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The forge's wiki outbox (`wiki_publications`) as each converge reconciles it against the freshly projected bible: a fact is projected only
 * from the published ordinal of the chapter it was learned in, so it is absent — not gated — until that chapter goes live; a new entity is
 * ledgered at revision 1, an unchanged one is never touched, and one left with no facet is tombstoned and deleted from the reader. The row
 * is `pending` only inside the converge that writes it, so the ledger is read once each converge settles.
 */

const KEEPER: BibleEntity = { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper', body: 'The keeper of the coast light for eleven winters.' };
const ORDER: BibleEntity = { entityKey: 'e2e-order', type: 'faction', name: 'The Tidewatch Order' };
const RIVAL: BibleEntity = { entityKey: 'e2e-rival', type: 'character', name: 'Odo the Assessor', body: 'A guild assessor who wants the coast light dark.' };

async function revealFact(owner: ForgeActor, projectId: string, factKey: string, subject: string, chapter: number): Promise<void> {
  const fact = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/facts/${factKey}`, { data: { text: `The ${factKey} holds.`, subjects: [subject] } });
  expect(fact.status(), await fact.text()).toBe(200);
  const reveal = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/facts/${factKey}/reveal`, { data: { entityKey: KEEPER.entityKey, chapter } });
  expect(reveal.status(), await reveal.text()).toBe(200);
}

test.describe('novel-forge wiki publishing ledger', () => {
  test('should leave out a fact learned in an unpublished chapter and add it, bumping the revision, once that chapter publishes', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'wiki-gate' });
    const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E Wiki Gate ${uniqueSuffix()}` }));
    const slug = lane.slug('wiki-gate');
    await createEntity(owner.ctx, projectId, KEEPER);
    await revealFact(owner, projectId, 'e2e-keeper-oath', KEEPER.entityKey, 2);

    expect((await publishForge(owner.ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    await publishForgeChapter(owner.ctx, projectId, 1);
    await reconcileUntilConverged(owner.ctx, projectId, [1], [KEEPER.entityKey]);
    const [first] = await readWikiLedgerRows(projectId);
    expect(first).toEqual(expect.objectContaining({ entryKey: KEEPER.entityKey, state: 'pushed', revision: 1 }));
    const [served] = await readServedWikiRows(slug);
    expect(served).toEqual(expect.objectContaining({ revision: 1, contentHash: first?.contentHash }));
    expect(
      served?.facets.map(facet => facet.facetKey),
      'the chapter-2 fact is absent, not gated',
    ).toEqual(['profile']);

    await publishForgeChapter(owner.ctx, projectId, 2);
    await reconcileUntilConverged(owner.ctx, projectId, [1, 2], [KEEPER.entityKey]);
    const [second] = await readWikiLedgerRows(projectId);
    expect(second).toEqual(expect.objectContaining({ state: 'pushed', revision: 2 }));
    expect(second?.contentHash).not.toBe(first?.contentHash);
    const [reserved] = await readServedWikiRows(slug);
    expect(reserved).toEqual(expect.objectContaining({ revision: 2, contentHash: second?.contentHash }));
    expect(reserved?.facets.map(facet => [facet.facetKey, facet.visibleFromOrdinal])).toEqual([
      ['profile', 0],
      ['fact:e2e-keeper-oath', 2],
    ]);
  });

  test('should ledger a new entity at revision 1, leave an unchanged one untouched and tombstone one left with no facet', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'wiki-reconcile' });
    const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E Wiki Reconcile ${uniqueSuffix()}` }));
    const slug = lane.slug('wiki-reconcile');
    await createEntity(owner.ctx, projectId, KEEPER);
    await createEntity(owner.ctx, projectId, ORDER);
    await revealFact(owner, projectId, 'e2e-order-flame', ORDER.entityKey, 1);

    expect((await publishForge(owner.ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    await publishForgeChapter(owner.ctx, projectId, 1);
    await reconcileUntilConverged(owner.ctx, projectId, [1], [KEEPER.entityKey, ORDER.entityKey]);
    const converged = await readWikiLedgerRows(projectId);
    expect(converged.map(row => [row.entryKey, row.state, row.revision])).toEqual([
      [KEEPER.entityKey, 'pushed', 1],
      [ORDER.entityKey, 'pushed', 1],
    ]);
    const keeper = converged.find(row => row.entryKey === KEEPER.entityKey);

    await createEntity(owner.ctx, projectId, RIVAL);
    await reconcileUntilConverged(owner.ctx, projectId, [1], [RIVAL.entityKey]);
    const grown = await readWikiLedgerRows(projectId);
    expect(grown.find(row => row.entryKey === RIVAL.entityKey)).toEqual(expect.objectContaining({ state: 'pushed', revision: 1 }));
    expect(
      grown.find(row => row.entryKey === KEEPER.entityKey),
      'an unchanged entity is never rewritten',
    ).toEqual(keeper);

    const retracted = await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/facts/e2e-order-flame`);
    expect(retracted.ok(), await retracted.text()).toBe(true);
    await reconcileUntilConverged(owner.ctx, projectId, [1], [KEEPER.entityKey, RIVAL.entityKey]);
    expect((await readWikiLedgerRows(projectId)).map(row => [row.entryKey, row.state])).toEqual([
      [KEEPER.entityKey, 'pushed'],
      [ORDER.entityKey, 'deleted'],
      [RIVAL.entityKey, 'pushed'],
    ]);
    expect(
      (await readServedWikiRows(slug)).map(row => row.entryKey),
      'the facet-less entry is gone from the reader',
    ).toEqual([KEEPER.entityKey, RIVAL.entityKey]);
    expect(await countEntities(projectId), 'the entity itself stays in the bible').toBe(3);
  });
});
