/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { reviseForgeChapter, settlePublishJob } from '../web-novel/forge-publication';
import { type ForgeActor } from './forge-actors';
import { expectCode } from './forge-arrange';
import {
  buildBundle,
  expect,
  holdForgeSlug,
  ladderSlugs,
  readLedgerRows,
  readPublicationRow,
  readPublishJob,
  setPublicationAuthor,
  test,
  updateChapterColumns,
} from './forge-bundles';
import { uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface PublicationView {
  novelSlug: string;
  revision: number;
  status: string;
  originalAuthor?: string | null;
}

interface ChapterPublicationView {
  chapter: number;
  publishedOrdinal: number;
  revision: number;
  contentHash: string;
  status: string;
  scheduledAt?: string | null;
}

interface LedgerView {
  publication?: { novelSlug: string };
  chapters: { chapter: number; publishedOrdinal: number; status: string }[];
}

/**
 * Declaring the constants
 *
 * The forge side of publishing: the publication record (catalog vocabulary, revision bumps, slugs), the curate-gated attribution, and the
 * chapter ledger (gates, ordinals, content hashes). Every assertion reads the forge's own rows; each save also enqueues the real reader push,
 * whose outcome the converge specs own. Refusals are proven by the row staying exactly as it was, and each group ends on the legitimate
 * save still landing.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FAR_FUTURE = '2031-01-01T00:00:00.000Z';

function publish(owner: ForgeActor, projectId: string, body: Record<string, unknown>): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/publish`, { data: body });
}

async function published(owner: ForgeActor, projectId: string, body: Record<string, unknown>): Promise<PublicationView> {
  const response = await publish(owner, projectId, body);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as PublicationView;
}

function publishChapter(owner: ForgeActor, projectId: string, chapter: number, body: Record<string, unknown> = {}): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/${chapter}/publish`, { data: body });
}

async function chapterPublished(owner: ForgeActor, projectId: string, chapter: number, body: Record<string, unknown> = {}): Promise<ChapterPublicationView> {
  const response = await publishChapter(owner, projectId, chapter, body);
  expect(response.status(), await response.text()).toBe(202);
  return (await response.json()) as ChapterPublicationView;
}

function unpublishChapter(owner: ForgeActor, projectId: string, chapter: number): Promise<APIResponse> {
  return mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/chapters/${chapter}/publish`);
}

function derivedSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

test.describe('novel-forge publication record', () => {
  test('should store catalog vocabulary, bump the revision only on a real change, and refuse what the reader would reject', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-vocab' });
    const projectId = await lane.project(owner, 'vocab');
    const slug = lane.slug('led-vocab');

    const created = await published(owner, projectId, {
      novelSlug: slug,
      title: 'The Quiet Coast',
      genres: ['Fantasy', 'Mystery'],
      tags: ['Female Protagonist'],
      violence: 'mild',
      darkContent: 'mild',
    });
    expect(created).toEqual(expect.objectContaining({ novelSlug: slug, revision: 1, status: 'live' }));

    expect((await published(owner, projectId, { tags: ['Female Protagonist', 'Weak to Strong'] })).revision, 'a tag-only change').toBe(2);
    expect((await published(owner, projectId, { violence: 'graphic' })).revision, 'a rating-only change').toBe(3);
    expect((await published(owner, projectId, { blurb: 'A keeper and a listening tide.' })).revision, 'a metadata-only save').toBe(4);
    expect(await readPublicationRow(projectId)).toEqual(
      expect.objectContaining({ genres: ['Fantasy', 'Mystery'], tags: ['Female Protagonist', 'Weak to Strong'], violence: 'graphic', darkContent: 'mild', revision: 4 }),
    );
    expect((await published(owner, projectId, { blurb: 'A keeper and a listening tide.', genres: ['Fantasy', 'Mystery'] })).revision, 'an unchanged resend').toBe(4);

    expect((await published(owner, projectId, { violence: null })).revision).toBe(5);
    expect(await readPublicationRow(projectId), 'a null clears only its own dimension').toEqual(expect.objectContaining({ violence: null, darkContent: 'mild' }));
    expect((await published(owner, projectId, { genres: null })).revision).toBe(6);
    expect(await readPublicationRow(projectId)).toEqual(expect.objectContaining({ genres: null, tags: ['Female Protagonist', 'Weak to Strong'] }));

    const before = await readPublicationRow(projectId);
    const refused: [string, Record<string, unknown>][] = [
      ['an unknown genre', { genres: ['Space Western'] }],
      ['a duplicate tag', { tags: ['Weak to Strong', 'Weak to Strong'] }],
      ['a duplicate genre', { genres: ['Fantasy', 'Fantasy'] }],
      ['a level from another dimension', { sexualContent: 'graphic' }],
      ['an unknown status', { status: 'draft' }],
    ];
    for (const [what, body] of refused) await expectCode(await publish(owner, projectId, { ...body, blurb: 'Never stored.' }), 422, 'VALIDATION_ERROR', what);
    expect(await readPublicationRow(projectId), 'a refused save writes nothing, not even its valid fields').toEqual(before);

    expect((await published(owner, projectId, { status: 'retired' })).status).toBe('retired');
    const relisted = await published(owner, projectId, { blurb: 'Back on the shelf.' });
    expect(relisted, 'an omitted status goes back to live').toEqual(expect.objectContaining({ status: 'live', revision: 8 }));
  });

  test('should keep an explicit slug, bump only when it moves, and refuse one another project holds', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-slugs' });
    const holder = await lane.project(owner, 'slug-holder');
    const claimant = await lane.project(owner, 'slug-claimant');
    const first = lane.slug('led-first');
    const moved = lane.slug('led-moved');
    const own = lane.slug('led-own');

    expect((await published(owner, holder, { novelSlug: first, title: 'The Salt Road' })).revision).toBe(1);
    expect((await published(owner, holder, { novelSlug: first })).revision, 'resending the same slug').toBe(1);
    expect(await published(owner, holder, { novelSlug: moved })).toEqual(expect.objectContaining({ novelSlug: moved, revision: 2 }));

    await expectCode(await publish(owner, claimant, { novelSlug: moved, title: 'The Salt Road' }), 409, 'PUB_007', 'creating on a held slug');
    expect(await readPublicationRow(claimant), 'no publication row is left behind').toBeUndefined();
    expect((await published(owner, claimant, { novelSlug: own, title: 'The Salt Road' })).novelSlug).toBe(own);
    await expectCode(await publish(owner, claimant, { novelSlug: moved }), 409, 'PUB_007', 'moving onto a held slug');
    expect(await readPublicationRow(claimant)).toEqual(expect.objectContaining({ novelSlug: own, revision: 1 }));
    expect(await readPublicationRow(holder)).toEqual(expect.objectContaining({ novelSlug: moved, revision: 2 }));
  });

  test('should derive a slug from the title, ladder past held rungs, fall back to novel and fit a long title', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-derive' });
    const title = `E2E Ladder ${uniqueSuffix()}`;
    const [base, second, third, fourth, fifth] = ladderSlugs(derivedSlug(title));
    await holdForgeSlug(owner, base as string);
    await holdForgeSlug(owner, second as string);

    const laddered = await lane.project(owner, 'derive-laddered');
    expect((await published(owner, laddered, { title })).novelSlug).toBe(third);

    await holdForgeSlug(owner, fourth as string);
    await holdForgeSlug(owner, fifth as string);
    const exhausted = await lane.project(owner, 'derive-exhausted');
    await expectCode(await publish(owner, exhausted, { title }), 409, 'PUB_008', 'every rung of the ladder held');
    expect(await readPublicationRow(exhausted)).toBeUndefined();
    expect((await published(owner, exhausted, { title, novelSlug: lane.slug('led-explicit') })).revision, 'an explicit slug is the way out').toBe(1);

    const punctuated = await lane.project(owner, 'derive-punctuation');
    expect((await published(owner, punctuated, { title: '!!! ???' })).novelSlug).toMatch(/^novel(-[2-5])?$/);

    const longTitle = `E2E Long ${uniqueSuffix()} ${'x'.repeat(200)}`;
    const long = await lane.project(owner, 'derive-long');
    const longSlug = (await published(owner, long, { title: longTitle })).novelSlug;
    expect(longSlug).toHaveLength(128);
    expect(longSlug).toMatch(SLUG_PATTERN);
    const longer = await lane.project(owner, 'derive-long-second');
    const suffixed = (await published(owner, longer, { title: longTitle })).novelSlug;
    expect(suffixed).toMatch(SLUG_PATTERN);
    expect(suffixed.length).toBeLessThanOrEqual(128);
    expect(suffixed).toBe(`${longSlug.slice(0, 126).replace(/-+$/, '')}-2`);
  });

  test("should refuse a novel rating below a chapter's, whether publishing the chapter or lowering the novel", async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-rating' });
    const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E Rating ${uniqueSuffix()}` }));
    await reviseForgeChapter(projectId, 1, { contentRating: { violence: 'graphic' } });
    await published(owner, projectId, { novelSlug: lane.slug('led-rating'), title: 'The Quiet Coast', violence: 'mild' });

    await expectCode(await publishChapter(owner, projectId, 1), 400, 'PUB_009', 'a chapter rated above the novel');
    expect(await readLedgerRows(projectId)).toEqual([]);

    expect((await published(owner, projectId, { violence: 'graphic' })).revision).toBe(2);
    await chapterPublished(owner, projectId, 1);
    await expectCode(await publish(owner, projectId, { violence: 'mild' }), 400, 'PUB_009', 'lowering the novel below a published chapter');
    await expectCode(await publish(owner, projectId, { violence: null }), 400, 'PUB_009', 'unrating the novel under a rated chapter');
    expect(await readPublicationRow(projectId)).toEqual(expect.objectContaining({ violence: 'graphic', revision: 2 }));
    expect((await published(owner, projectId, { violence: 'extreme' })).revision, 'raising the novel is always allowed').toBe(3);
  });
});

test.describe('novel-forge chapter ledger', () => {
  test('should gate chapter publishing on a publication, a finalized chapter and story order, and never reuse an ordinal', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-gates' });
    const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E Gates ${uniqueSuffix()}`, volumes: [{ title: 'One', chapters: 4 }] }));
    const ledger = async (): Promise<LedgerView> => (await (await owner.ctx.get(`/api/v1/projects/${projectId}/publications`)).json()) as LedgerView;

    expect(await ledger()).toEqual({ chapters: [] });
    await expectCode(await publishChapter(owner, projectId, 1), 404, 'PUB_001', 'a chapter of an unpublished novel');
    await expectCode(await unpublishChapter(owner, projectId, 1), 404, 'PUB_001', 'unpublishing on an unpublished novel');
    const slug = lane.slug('led-gates');
    await published(owner, projectId, { novelSlug: slug, title: 'The Quiet Coast' });

    await expectCode(await publishChapter(owner, projectId, 99), 404, 'CHP_001', 'an unknown chapter');
    await updateChapterColumns(projectId, 2, { locked: false });
    await expectCode(await publishChapter(owner, projectId, 2), 400, 'PUB_002', 'an unlocked chapter');
    await updateChapterColumns(projectId, 2, { locked: true });
    const prose = 'Chapter three, restored.';
    await reviseForgeChapter(projectId, 3, { content: '   ' });
    await expectCode(await publishChapter(owner, projectId, 3), 400, 'PUB_002', 'a chapter with no prose');
    await reviseForgeChapter(projectId, 3, { content: prose });
    await expectCode(await publishChapter(owner, projectId, 2), 400, 'PUB_003', 'a chapter ahead of an unpublished earlier one');
    expect(await readLedgerRows(projectId), 'no refused publish leaves a row').toEqual([]);

    const one = await chapterPublished(owner, projectId, 1);
    expect(one).toEqual(expect.objectContaining({ chapter: 1, publishedOrdinal: 1, revision: 1, status: 'scheduled' }));
    expect((await chapterPublished(owner, projectId, 2)).publishedOrdinal).toBe(2);
    const resent = await chapterPublished(owner, projectId, 1);
    expect(resent, 'a hash-stable republish keeps ordinal, revision and hash').toEqual(expect.objectContaining({ publishedOrdinal: 1, revision: 1, contentHash: one.contentHash }));

    await settlePublishJob(projectId);
    const idle = await readPublishJob(projectId);
    const scheduled = await chapterPublished(owner, projectId, 3, { scheduledAt: FAR_FUTURE });
    expect(scheduled).toEqual(expect.objectContaining({ publishedOrdinal: 3, status: 'scheduled' }));
    expect(new Date(scheduled.scheduledAt ?? 0).toISOString()).toBe(FAR_FUTURE);
    expect(await readPublishJob(projectId), 'a future release enqueues no push').toEqual(idle);

    const unpublished = await unpublishChapter(owner, projectId, 1);
    expect(unpublished.status(), await unpublished.text()).toBe(202);
    expect(await unpublished.json()).toEqual(expect.objectContaining({ publishedOrdinal: 1, status: 'unpublished' }));
    const repeated = await unpublishChapter(owner, projectId, 1);
    expect(repeated.status()).toBe(202);
    expect(await repeated.json()).toEqual(expect.objectContaining({ publishedOrdinal: 1, status: 'unpublished' }));
    await expectCode(await publishChapter(owner, projectId, 2), 400, 'PUB_003', 'republishing above the hole');
    await expectCode(await publishChapter(owner, projectId, 3), 400, 'PUB_003', 'rescheduling above the hole');
    await expectCode(await unpublishChapter(owner, projectId, 4), 404, 'PUB_001', 'unpublishing a chapter never published');

    expect((await chapterPublished(owner, projectId, 1)).publishedOrdinal, 'a republish fills the hole with its old ordinal').toBe(1);
    expect((await chapterPublished(owner, projectId, 4)).publishedOrdinal).toBe(4);
    const full = await ledger();
    expect(full.publication?.novelSlug).toBe(slug);
    expect(full.chapters.map(row => [row.chapter, row.publishedOrdinal])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
  });

  test("should keep a chapter's content hash under an unrelated change and move it on prose or rating", async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-hash' });
    const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E Hash ${uniqueSuffix()}` }));
    await published(owner, projectId, { novelSlug: lane.slug('led-hash'), title: 'The Quiet Coast', violence: 'graphic' });
    const first = await chapterPublished(owner, projectId, 1);

    await updateChapterColumns(projectId, 1, { wordCount: 9_999 });
    expect(await chapterPublished(owner, projectId, 1), 'a word count is not reader content').toEqual(expect.objectContaining({ contentHash: first.contentHash, revision: 1 }));

    await reviseForgeChapter(projectId, 1, { content: 'Mira climbed the stair one final time and put out the flame.' });
    const reprosed = await chapterPublished(owner, projectId, 1);
    expect(reprosed.contentHash).not.toBe(first.contentHash);
    expect(reprosed.revision).toBe(2);

    await reviseForgeChapter(projectId, 1, { contentRating: { violence: 'mild' } });
    const rerated = await chapterPublished(owner, projectId, 1);
    expect(rerated.contentHash).not.toBe(reprosed.contentHash);
    expect(rerated.revision).toBe(3);
    expect(rerated.publishedOrdinal).toBe(1);
  });
});

test.describe('novel-forge publication attribution', () => {
  test('should let a curator attribute the work, keep an unchanged name and clear it with null', async ({ forge, lane }) => {
    const team = await forge.team('pub-curation');
    const curator = await forge.actor({ label: 'pub-curator', organisation: team, roles: ['NovelForgeCurator'] });
    const projectId = await lane.project(curator, 'curated');

    const attributed = await published(curator, projectId, { novelSlug: lane.slug('led-curated'), title: 'The Salt Road', originalAuthor: '  Ada Lovelace  ' });
    expect(attributed).toEqual(expect.objectContaining({ originalAuthor: 'Ada Lovelace', revision: 1 }));
    expect((await published(curator, projectId, { originalAuthor: 'Ada Lovelace' })).revision, 'the same name again').toBe(1);
    expect(await published(curator, projectId, { originalAuthor: null })).toEqual(expect.objectContaining({ revision: 2 }));
    expect((await readPublicationRow(projectId))?.originalAuthor).toBeNull();
  });

  test('should refuse an attribution from a non-curator with no row written, and let them publish around an existing one', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-author' });
    const projectId = await lane.project(owner, 'attributed');
    const slug = lane.slug('led-attributed');

    await expectCode(
      await publish(owner, projectId, { novelSlug: slug, title: 'The Salt Road', originalAuthor: 'Ada Lovelace' }),
      403,
      'PUB_010',
      'a first publish naming an author',
    );
    expect(await readPublicationRow(projectId), 'the refused create leaves no publication').toBeUndefined();
    expect((await published(owner, projectId, { novelSlug: slug, title: 'The Salt Road' })).revision).toBe(1);

    await setPublicationAuthor(projectId, 'Grace Hopper');
    expect(await published(owner, projectId, { blurb: 'A caravan crosses a desert of salt.', originalAuthor: 'Grace Hopper' })).toEqual(
      expect.objectContaining({ originalAuthor: 'Grace Hopper', revision: 2 }),
    );
    expect(await published(owner, projectId, { blurb: 'Salt, and a road across it.' })).toEqual(expect.objectContaining({ originalAuthor: 'Grace Hopper', revision: 3 }));

    await expectCode(await publish(owner, projectId, { originalAuthor: 'Someone Else', blurb: 'Never stored.' }), 403, 'PUB_010', 'moving the attribution');
    expect(await readPublicationRow(projectId)).toEqual(expect.objectContaining({ originalAuthor: 'Grace Hopper', blurb: 'Salt, and a road across it.', revision: 3 }));
    expect(await published(owner, projectId, { originalAuthor: null }), 'clearing needs no curate permission').toEqual(
      expect.objectContaining({ originalAuthor: null, revision: 4 }),
    );
  });

  test('should adopt an imported genre on the first publish only, and never again after an explicit clear', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'pub-genre' });
    const bundle = (label: string): ReturnType<typeof buildBundle> => buildBundle({ title: `E2E ${label} ${uniqueSuffix()}`, genre: 'mystery' });

    const { projectId: adopted } = await lane.imported(owner, bundle('Adopted'));
    await published(owner, adopted, { novelSlug: lane.slug('led-adopted') });
    expect((await readPublicationRow(adopted))?.genres).toEqual(['Mystery']);
    await published(owner, adopted, { genres: null });
    await published(owner, adopted, { blurb: 'Saved after the clear.' });
    expect((await readPublicationRow(adopted))?.genres, 'the import is never consulted again').toBeNull();

    const { projectId: chosen } = await lane.imported(owner, bundle('Chosen'));
    await published(owner, chosen, { novelSlug: lane.slug('led-chosen'), genres: ['Horror'] });
    expect((await readPublicationRow(chosen))?.genres, 'the body outranks the import').toEqual(['Horror']);

    const { projectId: declined } = await lane.imported(owner, bundle('Declined'));
    await published(owner, declined, { novelSlug: lane.slug('led-declined'), genres: null });
    expect((await readPublicationRow(declined))?.genres, 'an explicit null on the first publish outranks the import').toBeNull();
  });
});
