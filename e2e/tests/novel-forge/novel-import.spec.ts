/**
 * Importing npm packages
 */

import { type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { csrfHeaders, novelForgeDb, pollUntil, requireProductUrl } from '../../lib';
import { expectCode } from './forge-arrange';
import {
  buildBundle,
  type BundleCover,
  countBibleDocuments,
  countProjectsOwnedBy,
  expect,
  ForgeBundleError,
  type ImportAccepted,
  postImport,
  readIllustrationRows,
  readLandedChapters,
  readVolumeRows,
  readZip,
  solidPng,
  storageRef,
  test,
} from './forge-bundles';
import { errorCode } from './forge-helpers';
import { readJobRow } from './forge-rows';

/**
 * Defining types
 */

interface ImportedProjectRow {
  coverImagePath: string | null;
  importedMeta: { genres?: string[] } | null;
  progress: Record<string, unknown> | null;
}

interface NovelManifest {
  schemaVersion: number;
  id: string;
  title: string;
  cover?: string;
  chapters: { title: string; file: string }[];
}

/**
 * Declaring the constants
 *
 * A novel import is one transaction that creates the project, its volumes and placeholder bible, and enqueues an `import` job, which the job
 * executor runs without any model: it lands the chapters and stores the cover. Only the final progress is asserted — each batch overwrites the
 * row's progress in place, and job events are recorded only for chat-started jobs (job.service.ts:339-341). Each malformed bundle is refused
 * before any project exists. The `.novel` export reads the same project back as a zip. What an import job keeps of the bundle is read from its
 * stored row, which is where the property lives.
 */

const COVER: BundleCover = { name: 'cover-art', mimeType: 'image/png', bytes: solidPng(180, 40, 60) };

/**
 * Thirteen one-megabyte chapters sit past the app-wide 12 MB body limit. Kept near that limit rather than at the
 * backlog's 20 MB: a 20 MB import OOM-killed the 1 GiB dev pod (exit 137) under the suite's concurrent load.
 */
const OVERSIZED_CHAPTERS = 13;

const MEGABYTE_CHAPTER = `${'The tide came in and the keeper counted the waves again. '.repeat(20_000).slice(0, 1024 * 1024 - 1)}.`;

/** The import route's own body limit. */
const IMPORT_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

const IMPORT_PERMITS = 2;

/** A permit an upload holds is returned when the client drops it, or at the latest by the server's 60-second receive deadline. */
const PERMIT_RETURN_MS = 75_000;

function uniqueTitle(label: string): string {
  return `E2E ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function readImportedProject(projectId: string, jobId: string): Promise<ImportedProjectRow | undefined> {
  const [row] = await novelForgeDb()<ImportedProjectRow[]>`
    SELECT p.cover_image_path AS "coverImagePath", p.imported_meta AS "importedMeta", j.progress FROM projects p JOIN jobs j ON j.project_id = p.id
    WHERE p.id = ${projectId} AND j.id = ${jobId}
  `;
  return row;
}

/**
 * Opens a POST declaring `declaredBytes` of JSON body on its own connection, with the actor's cookies and CSRF token, and sends none of it
 * yet; an `APIRequestContext` only sends whole bodies. The server sees the request before any body arrives.
 */
async function openUpload(ctx: APIRequestContext, path: string, declaredBytes: number): Promise<ClientRequest> {
  const url = new URL(path, requireProductUrl('novelForge'));
  const cookies = (await ctx.storageState()).cookies.filter(cookie => url.hostname.endsWith(cookie.domain.replace(/^\./, '')));
  const upload = httpsRequest(url, {
    method: 'POST',
    rejectUnauthorized: false,
    headers: {
      ...(await csrfHeaders(ctx)),
      cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
      'content-type': 'application/json',
      'content-length': String(declaredBytes),
    },
  });
  upload.on('error', () => undefined);
  upload.flushHeaders();
  return upload;
}

/** An import whose body never finishes arriving, so it holds one of the replica's import permits until it is destroyed. */
async function holdImportUpload(ctx: APIRequestContext): Promise<ClientRequest> {
  const upload = await openUpload(ctx, '/api/v1/import', 1024 * 1024);
  upload.write('{"bundle":');
  return upload;
}

/**
 * Streams `bytes` of body and returns the status the server answers, stopping the upload as soon as it answers. Posting a whole oversized
 * body races the refusal: the server answers and closes while the client is still writing, which the client sees as a hung-up socket.
 */
async function statusForOversizedBody(ctx: APIRequestContext, path: string, bytes: number): Promise<number> {
  const upload = await openUpload(ctx, path, bytes);
  const chunk = Buffer.alloc(64 * 1024, 0x20);
  let answered = false;
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new ForgeBundleError(`no answer to a ${bytes}-byte POST ${path}`)), 60_000);
      upload.once('response', response => {
        answered = true;
        clearTimeout(timer);
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      const pump = (sent: number): void => {
        if (answered || upload.destroyed) return;
        if (sent >= bytes) return void upload.end();
        const size = Math.min(chunk.length, bytes - sent);
        if (upload.write(size === chunk.length ? chunk : chunk.subarray(0, size))) setImmediate(() => pump(sent + size));
        else upload.once('drain', () => pump(sent + size));
      };
      pump(0);
    });
  } finally {
    upload.destroy();
  }
}

/** An import the server refuses as malformed once admitted, so a probe never creates a project. */
async function probeAdmission(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.post('/api/v1/import', { headers: await csrfHeaders(ctx), data: { bundle: { format: 'not-a-bundle', novel: {} } } });
}

async function insertDraft(projectId: string, chapter: number, title: string | null, body: string): Promise<void> {
  await novelForgeDb()`
    INSERT INTO drafts (project_id, chapter, title, status, revision, save_seq, body, generator, review_status)
    VALUES (${projectId}, ${chapter}, ${title}, 'draft', 1, 1, ${body}, 'human', 'needs_review')
  `;
}

test.describe('novel-forge novel import', () => {
  test('should refuse every malformed bundle with a 422 before any project exists, and land a valid one', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'imp-refusals' });
    const valid = buildBundle({ title: uniqueTitle('Refusals'), volumes: [{ title: 'One', chapters: 1 }, { chapters: 1 }] });
    const [first, second] = valid.volumes;
    const cases: [string, unknown][] = [
      ['a bad envelope', { format: 'not-a-bundle', novel: {} }],
      ['non-contiguous volume ordinals', { ...valid, volumes: [first, { ...second, ordinal: 3 }] }],
      ['duplicate volume ordinals', { ...valid, volumes: [first, { ...second, ordinal: 1 }] }],
      ['a novel title over 255 characters', { ...valid, novel: { ...valid.novel, title: 'T'.repeat(256) } }],
      ['a chapter title over 500 characters', { ...valid, volumes: [{ ...first, chapters: [{ title: 'C'.repeat(501), content: 'Prose.' }] }] }],
      ['whitespace-only chapter content', { ...valid, volumes: [{ ...first, chapters: [{ title: 'Blank', content: '  \n\t  ' }] }] }],
      ['a cover naming an unknown asset', { ...valid, novel: { ...valid.novel, cover: 'missing-art' } }],
      ['the retired source mode', { ...valid, mode: 'source' }],
    ];

    for (const [what, bundle] of cases) await expectCode(await postImport(owner.ctx, { bundle }), 422, 'VALIDATION_ERROR', what);
    expect(await countProjectsOwnedBy(owner), 'a refused import creates no project').toBe(0);

    const accepted = await lane.imported(owner, valid);
    expect(accepted.warnings).toEqual([]);
    expect((await readLandedChapters(accepted.projectId)).map(chapter => chapter.number)).toEqual([1, 2]);
  });

  test('should land a final bundle as locked human chapters with its volumes, placeholder bible, genre and cover', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'imp-land' });
    const unsafe = 'The keeper wrote <script>alert(1)</script> in the log.\r\nThen she closed it.';
    const bundle = buildBundle({
      title: uniqueTitle('Landing'),
      genre: '  fantasy ',
      cover: COVER,
      volumes: [{ title: 'Book One', chapters: 26 }, { chapters: 1 }],
      chapterText: chapter => (chapter === 1 ? unsafe : `Chapter ${chapter} of the long watch.`),
    });
    const accepted: ImportAccepted = await lane.imported(owner, bundle);
    const { projectId, jobId } = accepted;
    expect(accepted).toEqual({ projectId: expect.stringMatching(/^[0-9]+$/), jobId: expect.any(String), warnings: [] });

    const chapters = await readLandedChapters(projectId);
    expect(chapters.map(chapter => chapter.number)).toEqual(Array.from({ length: 27 }, (_, index) => index + 1));
    expect(new Set(chapters.map(chapter => `${chapter.status}/${chapter.generator}/${chapter.locked}`))).toEqual(new Set(['done/human/true']));
    expect(chapters.map(chapter => chapter.volumeKey)).toEqual([...Array<string>(26).fill('volume_1'), 'volume_2']);
    expect(chapters[26]?.title).toBe('Chapter 27: The Watch');
    const [sanitized] = chapters;
    expect(sanitized?.content).toContain('&lt;script&gt;');
    expect(sanitized?.content).not.toContain('<script>');
    expect(sanitized?.content, 'line endings are normalised to LF').not.toContain('\r');

    expect(await readVolumeRows(projectId)).toEqual([
      expect.objectContaining({ volumeKey: 'volume_1', ordinal: 1, title: 'Book One', state: 'active', contentHash: expect.any(String) }),
      expect.objectContaining({ volumeKey: 'volume_2', ordinal: 2, title: null, state: 'not_started', contentHash: expect.any(String) }),
    ]);
    expect(await countBibleDocuments(projectId), 'the same placeholder bible a new project gets').toBe(7);

    const project = await readImportedProject(projectId, jobId);
    expect(project?.importedMeta).toEqual({ genres: ['Fantasy'] });
    expect(project?.coverImagePath, 'the cover is stored content-addressed').toBe(storageRef(COVER.bytes));
    expect(project?.progress).toEqual({ done: 27, total: 27, current: 'chapters', phase: 'inserting' });
    expect(await readIllustrationRows(projectId)).toEqual([
      expect.objectContaining({ subjectType: 'cover', status: 'active', selectedRef: storageRef(COVER.bytes), promptKey: 'uploaded-cover' }),
    ]);
    expect((await readJobRow(jobId))?.payload, 'the stored payload keeps no prose or cover bytes').toEqual({ chapters: 27, hasCover: true });
  });

  test('should warn about a genre outside the platform vocabulary and store nothing for it', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'imp-genre' });
    const { projectId, jobId, warnings } = await lane.imported(owner, buildBundle({ title: uniqueTitle('Genre'), genre: 'Space Western' }));
    expect(warnings).toEqual([expect.stringContaining("novel.genre 'Space Western' is not one of the platform genres")]);
    expect((await readImportedProject(projectId, jobId))?.importedMeta ?? null).toBeNull();
    expect((await readJobRow(jobId))?.payload).toEqual({ chapters: 3, hasCover: false });
  });

  test('should accept a bundle past 12 MB on the import route while other write routes keep the 12 MB limit', async ({ forge, lane }) => {
    test.setTimeout(240_000);
    const owner = await forge.actor({ label: 'imp-size' });
    const bundle = buildBundle({ title: uniqueTitle('Oversized'), volumes: [{ title: 'Heavy', chapters: OVERSIZED_CHAPTERS }], chapterText: () => MEGABYTE_CHAPTER });
    expect(Buffer.byteLength(JSON.stringify({ bundle })), 'the bundle is past the app-wide limit').toBeGreaterThan(12 * 1024 * 1024);

    const accepted = await lane.imported(owner, bundle);
    const lengths = await novelForgeDb()<{ length: number }[]>`SELECT length(content)::int AS length FROM chapters WHERE project_id = ${accepted.projectId} ORDER BY number`;
    expect(lengths.map(row => row.length)).toEqual(Array<number>(OVERSIZED_CHAPTERS).fill(MEGABYTE_CHAPTER.length));

    expect(await statusForOversizedBody(owner.ctx, '/api/v1/projects', 13 * 1024 * 1024), 'a 13 MB body on an ordinary write route').toBe(413);
    expect(await countProjectsOwnedBy(owner)).toBe(1);
  });
});

test.describe('novel-forge import admission', () => {
  test('should refuse an import body past the route limit with a 413 and create nothing', async ({ forge }) => {
    const owner = await forge.actor({ label: 'imp-limit' });
    expect(await statusForOversizedBody(owner.ctx, '/api/v1/import', IMPORT_BODY_LIMIT_BYTES + 1024 * 1024), 'a 17 MiB import').toBe(413);
    expect(await countProjectsOwnedBy(owner), 'a refused import creates no project').toBe(0);
  });

  test('should refuse a third concurrent import with 429 IMP_001 and admit imports again once an upload is dropped', async ({ forge, lane }) => {
    test.setTimeout(PERMIT_RETURN_MS + 60_000);
    const owner = await forge.actor({ label: 'imp-admission' });
    const held: ClientRequest[] = [];
    try {
      for (let permit = 0; permit < IMPORT_PERMITS; permit++) held.push(await holdImportUpload(owner.ctx));
      const refused = await pollUntil(
        () => probeAdmission(owner.ctx),
        response => response.status() === 429,
        { timeoutMs: 10_000, intervalMs: 100 },
      );
      expect(refused.status(), `a third import while two uploads are in flight — body ${await refused.text()}`).toBe(429);
      expect(await errorCode(refused)).toBe('IMP_001');
      expect(Number(refused.headers()['retry-after']), 'the refusal says when to retry').toBeGreaterThan(0);
    } finally {
      for (const upload of held) upload.destroy();
    }

    const readmitted = await pollUntil(
      () => probeAdmission(owner.ctx),
      response => response.status() !== 429,
      { timeoutMs: PERMIT_RETURN_MS, intervalMs: 500 },
    );
    await expectCode(readmitted, 422, 'VALIDATION_ERROR', 'an import once the dropped uploads returned their permits');
    expect(await countProjectsOwnedBy(owner), 'no probe created a project').toBe(0);

    const accepted = await lane.imported(owner, buildBundle({ title: uniqueTitle('Admitted') }));
    expect((await readLandedChapters(accepted.projectId)).map(chapter => chapter.number)).toEqual([1, 2, 3]);
  });
});

test.describe('novel-forge .novel export', () => {
  test('should package the manifest, one Markdown file per chapter and the cover as a named zip download', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'exp-package' });
    const title = uniqueTitle('Export Coast');
    const { projectId } = await lane.imported(owner, buildBundle({ title, cover: COVER }));
    const landed = await readLandedChapters(projectId);

    const response = await owner.ctx.get(`/api/v1/projects/${projectId}/export/novel`);
    expect(response.status(), await response.text()).toBe(200);
    const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${projectId}`;
    expect(response.headers()['content-type']).toBe('application/zip');
    expect(response.headers()['content-disposition']).toBe(`attachment; filename="${id}.novel"`);

    const entries = readZip(await response.body());
    const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}') as NovelManifest;
    expect(manifest).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        id,
        title,
        cover: 'images/cover.png',
        chapters: landed.map(chapter => ({ title: chapter.title, file: `chapters/${String(chapter.number).padStart(4, '0')}.md` })),
      }),
    );
    for (const chapter of landed) expect(entries.get(`chapters/${String(chapter.number).padStart(4, '0')}.md`)?.toString('utf8')).toBe(chapter.content);
    expect(entries.get('images/cover.png')?.equals(COVER.bytes), 'the cover travels byte for byte').toBe(true);
  });

  test('should fall back to hand-written drafts, numbering an untitled one, when no chapter is finalized', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'exp-drafts' });
    const projectId = await lane.project(owner, 'export-drafts');
    await insertDraft(projectId, 1, null, 'Tamsin set her chain across the cobbles at dawn.');
    await insertDraft(projectId, 2, 'The Assessor Calls', 'Odo Kessling arrived with a stamped writ.');
    await insertDraft(projectId, 3, 'Unwritten', '   ');

    const response = await owner.ctx.get(`/api/v1/projects/${projectId}/export/novel`);
    expect(response.status(), await response.text()).toBe(200);
    const entries = readZip(await response.body());
    const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}') as NovelManifest;
    expect(manifest.chapters, 'a blank draft is left out').toEqual([
      { title: 'Chapter 1', file: 'chapters/0001.md' },
      { title: 'The Assessor Calls', file: 'chapters/0002.md' },
    ]);
    expect(entries.get('chapters/0001.md')?.toString('utf8')).toBe('Tamsin set her chain across the cobbles at dawn.');
    expect(manifest.cover).toBeUndefined();
    expect([...entries.keys()].some(name => name.startsWith('images/'))).toBe(false);

    await novelForgeDb()`DELETE FROM drafts WHERE project_id = ${projectId} AND chapter < 3`;
    await expectCode(await owner.ctx.get(`/api/v1/projects/${projectId}/export/novel`), 400, 'EXP_001', 'a project whose only draft is blank');
  });
});
