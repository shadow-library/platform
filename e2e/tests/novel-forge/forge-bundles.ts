/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';
import { deflateSync, inflateRawSync } from 'node:zlib';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { csrfHeaders, mutate, novelForgeDb, runAll, webNovelDb } from '../../lib';
import { removeServedNovelsOf, settlePublishJob } from '../web-novel/forge-publication';
import { arrangeNovel, deleteNovels, uniqueNovelSlug } from '../web-novel/helpers';
import { expect, type ForgeActor, test as forgeTest } from './forge-actors';
import { AI_ROLES, deleteForgeProjects, failPin, insertProject, listDispatchedModelCalls, listProjectIdsOwnedBy } from './forge-db';
import { pollJobStatus, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

export interface BundleVolume {
  title?: string;
  chapters: number;
}

export interface BundleCover {
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Buffer;
}

export interface BundleOptions {
  title: string;
  /** Default: one titled volume of three chapters. */
  volumes?: readonly BundleVolume[];
  genre?: string;
  tags?: string[];
  cover?: BundleCover;
  instructions?: string;
  /** Prose of the global chapter `n`; default a short numbered paragraph. */
  chapterText?: (chapter: number) => string;
  chapterTitle?: (chapter: number) => string;
}

export interface ImportBundle {
  format: 'novel-import';
  schemaVersion: 1;
  mode: 'final';
  novel: { title: string; synopsis: string; genre?: string; tags?: string[]; cover?: string; instructions?: string };
  volumes: { ordinal: number; title?: string; chapters: { title: string; content: string }[] }[];
  assets?: { name: string; mimeType: string; dataBase64: string }[];
}

export interface ImportAccepted {
  projectId: string;
  jobId: string;
  warnings: string[];
}

export interface LandedChapterRow {
  number: number;
  title: string | null;
  content: string | null;
  wordCount: number | null;
  status: string;
  generator: string;
  locked: boolean;
  volumeKey: string | null;
}

export interface VolumeRow {
  volumeKey: string;
  ordinal: number;
  title: string | null;
  state: string;
  contentHash: string | null;
}

export interface IllustrationRow {
  id: string;
  subjectType: string;
  subjectKey: string | null;
  status: 'active' | 'saved' | 'discarded';
  selectedRef: string | null;
  promptKey: string;
}

export interface PublishingLane {
  /** Quota-pins the project's owner and fail-pins every text role; the image role stays unpinned, since a pinned image model fails reference validation. */
  guard(projectId: string): Promise<void>;
  /** A guarded `new_novel` the lane removes, with everything the reader holds for it, after the test. */
  project(owner: ForgeActor, label: string, body?: Record<string, unknown>): Promise<string>;
  /** Imports `bundle` as a new guarded novel and waits for its chapters to land. */
  imported(owner: ForgeActor, bundle: ImportBundle): Promise<ImportAccepted>;
  /** Tracks a project another route created, so the lane removes it and its reader rows. */
  track(projectId: string): void;
  /** A slug no other test holds; reader rows under it and its whole suffix ladder are removed after the test. */
  slug(label: string): string;
  /** A reader novel another publisher serves at `slug`, removed after the test. */
  foreignNovel(slug: string): Promise<void>;
}

/**
 * Declaring the constants
 *
 * Arrangers for Novel Forge's import, export, illustration and publishing specs. Bundles are authored by hand (the import runs through the
 * job executor and calls no model), images are tiny fixed PNGs so the content-addressed store deduplicates them across runs, and the `.novel`
 * export is read with a central-directory zip reader over `node:zlib`. The lane fixture owns every project a test publishes: teardown settles
 * the push in flight, requires that nothing reached a model, deletes the project, then removes every reader novel under its ref or any slug
 * the test reserved or arranged.
 */

export const SLUG_LADDER = 5;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;

const DEFAULT_SYNOPSIS = 'A retired lighthouse keeper discovers the tide itself is listening, and it wants the flame she has guarded for eleven winters.';

/** An import writes rows only, but queues behind whatever else the executor is running. */
const IMPORT_SETTLE_MS = 60_000;

const FINAL_CHAPTERS: readonly { title: string; content: string }[] = [
  {
    title: 'The Last Watch',
    content:
      'Mira climbed the spiral stair for what she told herself was the last time, though she had said that every winter for eleven years. The lamp room smelled of brass polish and salt. Below, the sea moved the way it always moved at dusk, patient and unhurried, listening. She set the wick, struck the flame, and watched the beam swing out across water the colour of old iron. Somewhere past the third reef a bell buoy answered, faint and out of time.',
  },
  {
    title: 'A Voice in the Foam',
    content:
      'The voice came again with the seventh wave, the way it always did. Mira had stopped telling herself it was the wind three years ago. "I know you are there," she said to the dark water, and for the first time in all those winters, something answered — not in words she could keep, but in the long slow pull of the tide against the rocks, a rhythm that spelled her grandmother\'s name.',
  },
  {
    title: 'What the Tide Keeps',
    content:
      "It wanted the lamp. Not the light it cast, but the fire itself, the one her grandmother had carried up these same stairs eighty years before. Mira understood, then, why the keeper's post had never once gone empty in three hundred years, and why it never would, until someone finally stood at the rail and said no. She wrapped both hands around the warm brass and, for the first time, considered what the sea would do if she did.",
  },
];

/** A publish-ready novel: one volume of three hand-written chapters, titled and tagged, landed final — three, so a publish can skip one (PUB_003). */
export const FINAL_BUNDLE = {
  genre: 'fantasy',
  tags: ['fantasy', 'slow-burn'],
  chapterTitle: (chapter: number): string => FINAL_CHAPTERS[chapter - 1]?.title ?? `Chapter ${chapter}`,
  chapterText: (chapter: number): string => FINAL_CHAPTERS[chapter - 1]?.content ?? chapterProse(chapter),
} satisfies Omit<BundleOptions, 'title'>;

export class ForgeBundleError extends Error {
  override readonly name = 'ForgeBundleError';
}

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid 1×1 PNG of one colour; equal colours give equal bytes, so the store keeps one object per colour however often a run uploads it. */
export function solidPng(red: number, green: number, blue: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const pixels = deflateSync(Buffer.from([0, red, green, blue]));
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', pixels), pngChunk('IEND', Buffer.alloc(0))]);
}

/** The ref the content-addressed store files `bytes` under. */
export function storageRef(bytes: Buffer, ext = 'png'): string {
  return `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
}

export function chapterProse(chapter: number): string {
  return `Chapter ${chapter} opens on the coast. Mira climbs the stair, sets the wick, and watches the beam cross the water while the bell buoy answers from the reef.`;
}

export function buildBundle(options: BundleOptions): ImportBundle {
  const text = options.chapterText ?? chapterProse;
  const title = options.chapterTitle ?? ((chapter: number) => `Chapter ${chapter}: The Watch`);
  let chapter = 0;
  const volumes = (options.volumes ?? [{ title: 'The Quiet Coast', chapters: 3 }]).map((volume, index) => ({
    ordinal: index + 1,
    ...(volume.title === undefined ? {} : { title: volume.title }),
    chapters: Array.from({ length: volume.chapters }, () => {
      chapter += 1;
      return { title: title(chapter), content: text(chapter) };
    }),
  }));
  const cover = options.cover;
  return {
    format: 'novel-import',
    schemaVersion: 1,
    mode: 'final',
    novel: {
      title: options.title,
      synopsis: DEFAULT_SYNOPSIS,
      ...(options.genre === undefined ? {} : { genre: options.genre }),
      ...(options.tags === undefined ? {} : { tags: options.tags }),
      ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
      ...(cover ? { cover: cover.name } : {}),
    },
    volumes,
    ...(cover ? { assets: [{ name: cover.name, mimeType: cover.mimeType, dataBase64: cover.bytes.toString('base64') }] } : {}),
  };
}

/** `POST /api/v1/import` with any body, valid or not; `timeoutMs` covers a bundle of many megabytes. */
export async function postImport(ctx: APIRequestContext, body: unknown, timeoutMs = 30_000): Promise<APIResponse> {
  return ctx.post('/api/v1/import', { headers: await csrfHeaders(ctx), data: body, timeout: timeoutMs });
}

/** Starts importing {@link FINAL_BUNDLE} as a new project; the import job writes rows only and calls no model. */
export async function startFinalImport(ctx: APIRequestContext, title: string): Promise<ImportAccepted> {
  const response = await postImport(ctx, { bundle: buildBundle({ ...FINAL_BUNDLE, title }) });
  expect(response.status(), await response.text()).toBe(202);
  return (await response.json()) as ImportAccepted;
}

export async function expectImportLanded(jobId: string): Promise<void> {
  const job = await pollJobStatus(jobId, IMPORT_SETTLE_MS);
  expect(job.status, `import job failed: ${job.lastError ?? ''}`).toBe('done');
}

/**
 * Reads a zip's entries through its central directory, which is where the sizes live whether or not the writer streamed them. Stored and
 * deflated entries only — the two methods a `.novel` package uses.
 */
export function readZip(archive: Buffer): Map<string, Buffer> {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== ZIP_END_OF_CENTRAL_DIRECTORY) end--;
  if (end < 0) throw new ForgeBundleError('no end-of-central-directory record: not a zip archive');

  const entries = new Map<string, Buffer>();
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(offset) !== ZIP_CENTRAL_FILE_HEADER) throw new ForgeBundleError(`central directory entry ${index} is malformed`);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);

    const dataStart = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const data = archive.subarray(dataStart, dataStart + compressedSize);
    if (method !== 0 && method !== 8) throw new ForgeBundleError(`entry ${name} uses compression method ${method}`);
    entries.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function countProjectsOwnedBy(owner: ForgeActor): Promise<number> {
  return (await listProjectIdsOwnedBy(owner.owner)).length;
}

export async function readLandedChapters(projectId: string): Promise<LandedChapterRow[]> {
  return novelForgeDb()<LandedChapterRow[]>`
    SELECT number, title, content, word_count AS "wordCount", status, generator, locked, volume_key AS "volumeKey"
    FROM chapters WHERE project_id = ${projectId} ORDER BY number
  `;
}

export async function readVolumeRows(projectId: string): Promise<VolumeRow[]> {
  return novelForgeDb()<VolumeRow[]>`
    SELECT volume_key AS "volumeKey", ordinal, title, state, content_hash AS "contentHash" FROM volumes WHERE project_id = ${projectId} ORDER BY ordinal
  `;
}

export async function countBibleDocuments(projectId: string): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM bible_documents WHERE project_id = ${projectId}`;
  return row?.count ?? 0;
}

export async function countEntities(projectId: string): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM entities WHERE project_id = ${projectId}`;
  return row?.count ?? 0;
}

export async function readIllustrationRows(projectId: string): Promise<IllustrationRow[]> {
  return novelForgeDb()<IllustrationRow[]>`
    SELECT id::text, subject_type AS "subjectType", subject_key AS "subjectKey", status, selected_ref AS "selectedRef", prompt_spec->>'promptKey' AS "promptKey"
    FROM illustrations WHERE project_id = ${projectId} ORDER BY id
  `;
}

/** An illustration mid-flight — generated, nothing selected yet — the state a generation leaves and no model-free route reaches. */
export async function insertUnselectedIllustration(projectId: string, subjectType: 'cover' | 'entity', subjectKey: string | null = null): Promise<string> {
  const sql = novelForgeDb();
  const spec = { basePrompt: 'Arranged by the e2e suite.', subjectFraming: '', styleNotes: '', instructions: [], promptKey: 'e2e-arranged', promptVersion: '1.0.0' };
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO illustrations (project_id, subject_type, subject_key, status, prompt_spec, candidates, "references", selected_ref, owner_kind, owner_id)
    SELECT id, ${subjectType}::illustration_subject_type, ${subjectKey}, 'active', ${sql.json(spec as never)}, '[]'::jsonb, '[]'::jsonb, NULL, owner_kind, owner_id
    FROM projects WHERE id = ${projectId}
    RETURNING id::text
  `;
  if (!row) throw new ForgeBundleError(`no project ${projectId} to arrange an illustration on`);
  return row.id;
}

export async function setIllustrationStatus(illustrationId: string, status: 'active' | 'saved' | 'discarded'): Promise<void> {
  const updated = await novelForgeDb()`UPDATE illustrations SET status = ${status}::illustration_status, updated_at = now() WHERE id = ${illustrationId}`;
  if (updated.count !== 1) throw new ForgeBundleError(`no illustration ${illustrationId}`);
}

/** A bare publication row holding `slug`, on a bare project of `owner` — how a rung of the slug ladder is occupied without a reader push. */
export async function holdForgeSlug(owner: ForgeActor, slug: string): Promise<void> {
  const projectId = await insertProject({ owner: owner.owner, name: `e2e-forge-slug-holder-${uniqueSuffix()}` });
  await novelForgeDb()`INSERT INTO publications (project_id, novel_slug, title, status) VALUES (${projectId}, ${slug}, 'Held by the e2e suite', 'live')`;
}

/** Writes publication vocabulary behind the DTO's back, as a row stored before the vocabulary tightened would hold it. */
export async function writePublicationVocabulary(projectId: string, genres: string[], tags: string[]): Promise<void> {
  const sql = novelForgeDb();
  const updated = await sql`
    UPDATE publications SET genres = ${sql.json(genres)}, tags = ${sql.json(tags)}, revision = revision + 1, updated_at = now() WHERE project_id = ${projectId}
  `;
  if (updated.count !== 1) throw new ForgeBundleError(`no publication for project ${projectId}`);
}

export async function setPublicationAuthor(projectId: string, originalAuthor: string): Promise<void> {
  const updated = await novelForgeDb()`UPDATE publications SET original_author = ${originalAuthor}, updated_at = now() WHERE project_id = ${projectId}`;
  if (updated.count !== 1) throw new ForgeBundleError(`no publication for project ${projectId}`);
}

/** Wipes the reader's copy of a novel — chapters, wiki and grants cascade with it — as a reader restored from empty would stand. */
export async function wipeServedNovel(slug: string): Promise<void> {
  const deleted = await webNovelDb()`DELETE FROM novels WHERE slug = ${slug}`;
  if (deleted.count !== 1) throw new ForgeBundleError(`no served novel ${slug} to wipe`);
}

/** Hands a served novel to another publisher, as a rotated forge client id would leave it: the forge's ref no longer finds it. */
export async function reassignServedPublisher(slug: string, sourceClientId: string): Promise<void> {
  const updated = await webNovelDb()`UPDATE novels SET source_client_id = ${sourceClientId} WHERE slug = ${slug}`;
  if (updated.count !== 1) throw new ForgeBundleError(`no served novel ${slug} to reassign`);
}

export function ladderSlugs(base: string): string[] {
  return [base, ...Array.from({ length: SLUG_LADDER - 1 }, (_, index) => `${base}-${index + 2}`)];
}

/** Every text role; the image role stays on its tier default so reference validation can read the image model's capacity. */
const GUARDED_ROLES = AI_ROLES.filter(role => role !== 'image');

export const test = forgeTest.extend<{ lane: PublishingLane }>({
  lane: async ({ forge }, use) => {
    const projects: string[] = [];
    const slugs: string[] = [];

    const guard = async (projectId: string): Promise<void> => {
      await forge.quotaPin(projectId);
      await failPin(projectId, GUARDED_ROLES);
      if (!projects.includes(projectId)) projects.push(projectId);
    };

    await use({
      guard,
      track: projectId => {
        if (!projects.includes(projectId)) projects.push(projectId);
      },
      project: async (owner, label, body = {}) => {
        const response = await mutate(owner.ctx, 'post', '/api/v1/projects', {
          data: { name: `e2e-forge-${label}-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard', ...body },
        });
        expect(response.status(), await response.text()).toBe(201);
        const projectId = ((await response.json()) as { id: string }).id;
        projects.push(projectId);
        await guard(projectId);
        return projectId;
      },
      imported: async (owner, bundle) => {
        const response = await postImport(owner.ctx, { bundle });
        expect(response.status(), await response.text()).toBe(202);
        const accepted = (await response.json()) as ImportAccepted;
        projects.push(accepted.projectId);
        await expectImportLanded(accepted.jobId);
        await guard(accepted.projectId);
        return accepted;
      },
      slug: label => {
        const reserved = uniqueNovelSlug(label);
        slugs.push(...ladderSlugs(reserved));
        return reserved;
      },
      foreignNovel: async slug => {
        slugs.push(slug);
        await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 0, title: `Held by another publisher ${slug}` });
      },
    });

    const dispatched: string[] = [];
    await runAll([
      ...projects.map(projectId => () => settlePublishJob(projectId)),
      ...projects.map(projectId => async () => {
        const models = await listDispatchedModelCalls(projectId);
        if (models.length > 0) dispatched.push(`project ${projectId}: ${models.join(', ')}`);
      }),
      () => deleteForgeProjects(projects),
      ...projects.map(projectId => () => removeServedNovelsOf(projectId)),
      () => deleteNovels(slugs),
    ]);
    expect(dispatched, 'no request of this test may reach a model').toEqual([]);
  },
});

export { expect } from './forge-actors';
