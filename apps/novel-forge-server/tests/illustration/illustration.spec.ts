import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config } from '@shadow-library/common';
import { StorageErrorCode } from '@shadow-library/modules';

import { ProjectEventService } from '@modules/events';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { CatalogService } from '@modules/ai/context/catalog.service';
import { getProfileDefaults } from '@modules/ai/defaults';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { type AppearanceDescriberService, type AppearanceDescription, type DescribeAppearanceRequest } from '@modules/ai/appearance-describer.service';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { MODEL_MAP } from '@modules/ai/models';
import { parseSchema } from '@modules/ai/schemas/validate';
import { EntityService } from '@modules/bible/entity/entity.service';
import { ChapterImageService } from '@modules/generation/chapter-image.service';
import { StartIllustrationBody, UpdateIllustrationReferencesBody } from '@modules/illustration/illustration.dto';
import { IllustrationModule } from '@modules/illustration/illustration.module';
import { IllustrationReferenceService } from '@modules/illustration/illustration-reference.service';
import { IllustrationService } from '@modules/illustration/illustration.service';
import { applyInstructionEdit, hashInstructions, renderPromptSpec } from '@modules/illustration/prompt-spec';
import { setProjectCover, uploadedCoverPromptSpec } from '@modules/illustration/uploaded-cover';
import { ProjectService } from '@modules/project/project/project.service';
import { AppErrorCode } from '@server/classes';
import { type Illustration, type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_illustration`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

// The router and the image call read credentials straight off the Config cache, which no test
// bootstrap populates.
function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

interface ImageRequest {
  model: string;
  prompt: string;
  n: number;
  input_references?: unknown[];
}

interface Harness {
  service: IllustrationService;
  storage: unknown;
  imageRequests: ImageRequest[];
  composePrompts: string[];
  deleted: string[];
  reads: string[];
  describeCalls: DescribeAppearanceRequest[];
  describe: () => Promise<AppearanceDescription>;
  compose: { basePrompt: string; subjectFraming: string; styleNotes: string; appearance?: string };
  onImageRequest?: () => Promise<void>;
  put(content: string | Uint8Array, contentType?: string): string;
}

// Object storage itself (content-addressing, public URLs, the local/S3 providers) is exercised in
// `@shadow-library/modules`' storage-module suite; here it is a map from ref to bytes so the
// image-to-image reference path can be asserted without a provider.
function buildHarness(db: PrimaryDatabase): Harness {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const deleted: string[] = [];
  const reads: string[] = [];
  // Refs are unique per harness: every test in the file shares one database, so a per-test counter alone
  // would collide with an earlier test's rows and make the reference check keep an object alive.
  const prefix = `ref-${Math.random().toString(36).slice(2)}`;
  let saved = 0;
  const put = (bytes: Uint8Array, contentType = 'image/png'): string => {
    const ref = `${prefix}-${++saved}`;
    objects.set(ref, { bytes, contentType });
    return ref;
  };
  const storage = {
    save: async (bytes: Uint8Array, options?: { contentType?: string }) => put(bytes, options?.contentType),
    stat: async (ref: string) => {
      const object = objects.get(ref);
      if (!object) throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref });
      return { size: object.bytes.byteLength, contentType: object.contentType };
    },
    read: async (ref: string) => {
      reads.push(ref);
      const object = objects.get(ref);
      if (!object) throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref });
      return object;
    },
    delete: async (ref: string) => void deleted.push(ref),
    getPublicUrl: (ref?: string | null) => (ref ? `https://cdn.test/${ref}` : undefined),
  };

  const harness: Harness = {
    imageRequests: [],
    composePrompts: [],
    deleted,
    reads,
    describeCalls: [],
    describe: async () => ({ appearance: 'broad-shouldered, close-cropped black hair, a notched left ear', confidence: 'high' }),
    put: (content, contentType) => put(typeof content === 'string' ? new TextEncoder().encode(content) : content, contentType),
    compose: { basePrompt: 'a lone swordsman on a frozen ridge, backlit', subjectFraming: 'half-body portrait, shallow depth of field', styleNotes: 'ink wash, muted palette' },
    service: undefined as unknown as IllustrationService,
    storage,
  };

  const dbStub = { getPostgresClient: () => db } as never;
  const router = new ModelRouterService({} as never, dbStub, { enforce: async () => undefined } as never, { defaultsFor: async () => undefined } as never);
  const assembler = new ContextAssembler(dbStub, new CatalogService(dbStub));
  const workflowRuns = new WorkflowRunService(dbStub, assembler, router, {} as never, {} as never, {} as never, {} as never, new ProjectEventService());
  const describer = {
    describe: (request: DescribeAppearanceRequest) => {
      harness.describeCalls.push(request);
      return harness.describe();
    },
  } as unknown as AppearanceDescriberService;
  harness.service = new IllustrationService(
    dbStub,
    storage as never,
    router,
    assembler,
    workflowRuns,
    new EntityService(dbStub, storage as never),
    new ChapterImageService(dbStub, storage as never),
    new ProjectService(dbStub, {} as never, storage as never),
    noPluginPolicy(),
    new IllustrationReferenceService(dbStub, storage as never, router),
    describer,
  );

  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (String(url).endsWith('/images')) {
      harness.imageRequests.push(body as unknown as ImageRequest);
      await harness.onImageRequest?.();
      const data = Array.from({ length: body['n'] as number }, (_, index) => ({ b64_json: Buffer.from(`png-${harness.imageRequests.length}-${index}`).toString('base64') }));
      return { ok: true, json: async () => ({ data }) };
    }

    harness.composePrompts.push(JSON.stringify(body['messages']));
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        id: 'compose-1',
        object: 'chat.completion',
        created: 0,
        model: String(body['model']),
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(harness.compose) } }],
      }),
    };
  };

  return harness;
}

describe('illustration prompt spec', () => {
  const spec = {
    basePrompt: 'base',
    subjectFraming: 'framing',
    styleNotes: 'style',
    appearanceAnchor: 'silver hair, scarred jaw',
    instructions: ['rain', 'night'],
    promptKey: 'illustration-compose',
    promptVersion: '1.0.0',
  };

  it('should lead the rendered prompt with the appearance anchor and end with the instructions', () => {
    const rendered = renderPromptSpec(spec);
    expect(rendered.indexOf('silver hair')).toBeLessThan(rendered.indexOf('base'));
    expect(rendered.indexOf('rain')).toBeLessThan(rendered.indexOf('night'));
  });

  it('should append an instruction', () => {
    expect(applyInstructionEdit(['a'], { add: 'b' })).toEqual(['a', 'b']);
  });

  it('should remove an instruction by index rather than rewriting the list', () => {
    expect(applyInstructionEdit(['a', 'b', 'c'], { removeIndex: 1 })).toEqual(['a', 'c']);
  });

  it('should replace a single instruction in place', () => {
    expect(applyInstructionEdit(['a', 'b'], { replace: { index: 0, text: 'z' } })).toEqual(['z', 'b']);
  });

  it('should reject an edit that is not exactly one operation', () => {
    expect(() => applyInstructionEdit(['a'], {})).toThrow();
    expect(() => applyInstructionEdit(['a'], { add: 'b', removeIndex: 0 })).toThrow();
  });

  it('should reject an out-of-range index', () => {
    expect(() => applyInstructionEdit(['a'], { removeIndex: 4 })).toThrow();
    expect(() => applyInstructionEdit(['a'], { replace: { index: 4, text: 'z' } })).toThrow();
  });
});

describe('IllustrationService', () => {
  it('should expose the service and module', () => {
    expect(IllustrationService).toBeDefined();
    expect(IllustrationModule).toBeDefined();
  });
});

describe.if(pgAvailable)('IllustrationService — canon-driven generation', () => {
  let db: PrimaryDatabase;
  let harness: Harness;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    setConfig('ai.openrouter.api.key', 'test-key');
    setConfig('ai.openrouter.api.url', 'https://openrouter.test/api/v1');
    setConfig('storage.public-origin', 'https://cdn.test');
  });

  beforeEach(() => {
    harness = buildHarness(db);
  });

  afterAll(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
    return (db as unknown as { $client: SQL }).$client.close();
  });

  async function seedProject(name: string, config: Record<string, unknown> | null = null, contentMode: 'standard' | 'unrestricted' = 'standard'): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `${name}-${Date.now()}-${Math.random()}`, kind: 'source', contentMode, config: config as never, premise: 'A frozen empire eats its heirs.' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  async function seedEntity(projectId: bigint, entityKey: string, name: string, appearance?: string): Promise<bigint> {
    const [entity] = await db.insert(schema.entities).values({ projectId, entityKey, type: 'character', name, appearance }).returning();
    if (!entity) throw new Error('failed to seed entity');
    return entity.id;
  }

  it('should persist a row with two candidates and the composed prompt spec', async () => {
    const projectId = await seedProject('illustration-start');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair, scarred jaw');

    const illustration = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero', instruction: 'standing in falling snow' });

    expect(illustration.candidates).toHaveLength(2);
    expect(illustration.status).toBe('active');
    expect(illustration.revision).toBe(1);
    expect(illustration.instructions).toEqual(['standing in falling snow']);
    expect(harness.imageRequests[0]?.n).toBe(2);

    const stored = await db.query.illustrations.findFirst({ where: eq(schema.illustrations.id, illustration.id) });
    expect(stored?.promptSpec.basePrompt).toBe(harness.compose.basePrompt);
    expect(stored?.promptSpec.promptKey).toBe('illustration-compose');
  });

  it('should anchor the image prompt on the entity appearance', async () => {
    const projectId = await seedProject('illustration-anchor');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair, scarred jaw');

    await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });

    expect(harness.imageRequests[0]?.prompt).toContain('silver hair, scarred jaw');
  });

  it('should offer back an appearance the composer derived for an entity that had none', async () => {
    const projectId = await seedProject('illustration-derived');
    await seedEntity(projectId, 'hero', 'Evan Vale');
    harness.compose = { ...harness.compose, appearance: 'gaunt, ash-blond, storm-grey coat' };

    const illustration = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });

    expect(illustration.suggestedAppearance).toBe('gaunt, ash-blond, storm-grey coat');
    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'hero')) });
    expect(entity?.appearance).toBeNull();
  });

  it('should send the composer the project art-style bible when one exists', async () => {
    const projectId = await seedProject('illustration-art-style');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
    await db.insert(schema.bibleDocuments).values({ projectId, section: 'project', slug: 'art-style', body: 'Heavy ink outlines over a bleached winter palette.' });

    await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });

    expect(harness.composePrompts[0]).toContain('Heavy ink outlines');
  });

  it('should edit the instruction list structurally instead of concatenating, and carry the selection as a reference image', async () => {
    const projectId = await seedProject('illustration-refine');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');

    const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero', instruction: 'in falling snow' });
    const selected = await harness.service.select(projectId, started.id, started.candidates[0]!.ref);
    const added = await harness.service.refine(projectId, started.id, { add: 'holding a lantern' });
    const replaced = await harness.service.refine(projectId, started.id, { replace: { index: 0, text: 'under a red sky' } });
    const removed = await harness.service.refine(projectId, started.id, { removeIndex: 1 });

    expect(added.instructions).toEqual(['in falling snow', 'holding a lantern']);
    expect(replaced.instructions).toEqual(['under a red sky', 'holding a lantern']);
    expect(removed.instructions).toEqual(['under a red sky']);
    expect(removed.revision).toBe(4);
    expect(removed.candidates).toHaveLength(8);
    expect(harness.imageRequests[1]?.input_references).toHaveLength(1);
    expect(harness.imageRequests[1]?.prompt).not.toContain('holding a lantern\n\nholding a lantern');
    expect(selected.selectedRef).toBe(started.candidates[0]!.ref);
    expect(removed.selectedRef).toBeNull();
  });

  it('should reject a candidate that belongs to another illustration', async () => {
    const projectId = await seedProject('illustration-select-foreign');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
    const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });

    expect(harness.service.select(projectId, started.id, 'ref-not-mine')).rejects.toThrow();
  });

  it('should write the selection to the entity portrait and collect the unselected candidate', async () => {
    const projectId = await seedProject('illustration-save-portrait');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');

    const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
    await harness.service.select(projectId, started.id, started.candidates[0]!.ref);
    const saved = await harness.service.save(projectId, started.id, 'portrait');

    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'hero')) });
    expect(entity?.imagePath).toBe(started.candidates[0]!.ref);
    expect(saved.status).toBe('saved');
    expect(harness.deleted).toEqual([started.candidates[1]!.ref]);
  });

  it('should append to the entity gallery for the gallery target', async () => {
    const projectId = await seedProject('illustration-save-gallery');
    const entityId = await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');

    const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
    await harness.service.select(projectId, started.id, started.candidates[1]!.ref);
    await harness.service.save(projectId, started.id, 'gallery');

    const images = await db.query.entityImages.findMany({ where: eq(schema.entityImages.entityId, entityId) });
    expect(images.map(image => image.imagePath)).toEqual([started.candidates[1]!.ref]);
  });

  it('should append a scene image for the chapter target', async () => {
    const projectId = await seedProject('illustration-save-chapter');
    await db.insert(schema.chapters).values({ projectId, number: 3, title: 'The Ridge', summary: 'Evan crosses the ridge alone.', status: 'done' });

    const started = await harness.service.start(projectId, { subjectType: 'chapter', subjectKey: '3' });
    await harness.service.select(projectId, started.id, started.candidates[0]!.ref);
    await harness.service.save(projectId, started.id, 'chapter');

    const images = await db.query.chapterImages.findMany({ where: and(eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, 3)) });
    expect(images.map(image => image.imagePath)).toEqual([started.candidates[0]!.ref]);
  });

  it('should point the project cover at the selection for the cover target', async () => {
    const projectId = await seedProject('illustration-save-cover');

    const started = await harness.service.start(projectId, { subjectType: 'cover' });
    await harness.service.select(projectId, started.id, started.candidates[0]!.ref);
    await harness.service.save(projectId, started.id, 'cover');

    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.coverImagePath).toBe(started.candidates[0]!.ref);
  });

  it('should reject a save target that does not match the subject', async () => {
    const projectId = await seedProject('illustration-save-mismatch');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
    const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
    await harness.service.select(projectId, started.id, started.candidates[0]!.ref);

    expect(harness.service.save(projectId, started.id, 'cover')).rejects.toThrow();
  });

  it('should refuse to save before a candidate is selected', async () => {
    const projectId = await seedProject('illustration-save-unselected');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
    const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });

    expect(harness.service.save(projectId, started.id, 'portrait')).rejects.toThrow();
  });

  it('should delete every candidate object on discard and refuse further edits', async () => {
    const projectId = await seedProject('illustration-discard');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');

    const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
    const discarded = await harness.service.discard(projectId, started.id);

    expect(discarded.status).toBe('discarded');
    expect(harness.deleted).toEqual(started.candidates.map(candidate => candidate.ref));
    expect(harness.service.refine(projectId, started.id, { add: 'more snow' })).rejects.toThrow();
  });

  it('should keep a candidate object that another live illustration still references', async () => {
    const projectId = await seedProject('illustration-gc-shared');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');

    const first = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
    await db.insert(schema.illustrations).values({
      projectId,
      subjectType: 'entity',
      subjectKey: 'hero',
      promptSpec: { basePrompt: 'b', subjectFraming: 'f', styleNotes: 's', instructions: [], promptKey: 'illustration-compose', promptVersion: '1.0.0' },
      candidates: [{ ref: first.candidates[0]!.ref, createdAt: new Date().toISOString(), instructionsHash: 'x', referenceRefs: [], references: [] }],
    });

    await harness.service.discard(projectId, first.id);

    expect(harness.deleted).toEqual([first.candidates[1]!.ref]);
  });

  it('should list prior illustrations for a subject so a saved image can be re-rolled', async () => {
    const projectId = await seedProject('illustration-list');
    await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
    await seedEntity(projectId, 'villain', 'Mara', 'black braid');

    const hero = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
    await harness.service.select(projectId, hero.id, hero.candidates[0]!.ref);
    await harness.service.save(projectId, hero.id, 'portrait');
    await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'villain' });

    const scoped = await harness.service.list(projectId, { subjectType: 'entity', subjectKey: 'hero' });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.status).toBe('saved');
    expect(scoped[0]?.prompt).toContain('silver hair');
    expect(await harness.service.list(projectId)).toHaveLength(2);
  });

  function projectService(): ProjectService {
    return new ProjectService({ getPostgresClient: () => db } as never, {} as never, harness.storage as never);
  }

  async function uploadCover(projectId: bigint, image = 'aW1hZ2U='): Promise<string> {
    const project = await projectService().setCover(projectId, image, 'image/png');
    return project.coverImagePath as string;
  }

  function coverIllustrations(projectId: bigint): Promise<Illustration.Row[]> {
    return db.query.illustrations.findMany({
      where: and(eq(schema.illustrations.projectId, projectId), eq(schema.illustrations.subjectType, 'cover')),
      orderBy: [desc(schema.illustrations.id)],
    });
  }

  describe('uploaded covers', () => {
    it('should open one active cover illustration on the upload when the cover is set', async () => {
      const projectId = await seedProject('illustration-uploaded-cover');
      const ref = await uploadCover(projectId);

      const rows = await coverIllustrations(projectId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'active', subjectKey: null, selectedRef: ref, revision: 1, promptSpec: uploadedCoverPromptSpec() });
      expect(rows[0]?.candidates).toEqual([{ ref, createdAt: expect.any(String), instructionsHash: hashInstructions([]), referenceRefs: [], references: [] }]);

      const covers = await harness.service.list(projectId, { subjectType: 'cover' });
      expect(covers).toHaveLength(1);
      expect(covers[0]).toMatchObject({ origin: 'uploaded', selectedUrl: `https://cdn.test/${ref}` });
      expect(await harness.service.list(projectId, { subjectType: 'entity' })).toHaveLength(0);
    });

    it('should not create records when listing a cover written outside setProjectCover', async () => {
      const projectId = await seedProject('illustration-list-read-only');
      await db.update(schema.projects).set({ coverImagePath: 'ref-untracked-cover' }).where(eq(schema.projects.id, projectId));

      expect(await harness.service.list(projectId)).toHaveLength(0);
      expect(await coverIllustrations(projectId)).toHaveLength(0);
    });

    it('should open a single illustration when the same cover is set concurrently', async () => {
      const projectId = await seedProject('illustration-uploaded-cover-race');
      const ref = await uploadCover(projectId);
      await db.delete(schema.illustrations).where(eq(schema.illustrations.projectId, projectId));

      await Promise.all([setProjectCover(db, projectId, ref), setProjectCover(db, projectId, ref), setProjectCover(db, projectId, ref)]);

      expect(await coverIllustrations(projectId)).toHaveLength(1);
    });

    it('should not open one for a generated cover saved from the Illustrations tab', async () => {
      const projectId = await seedProject('illustration-generated-cover');
      const started = await harness.service.start(projectId, { subjectType: 'cover' });
      await harness.service.select(projectId, started.id, started.candidates[0]!.ref);
      await harness.service.save(projectId, started.id, 'cover');

      const items = await harness.service.list(projectId);
      expect(items).toHaveLength(1);
      expect(items[0]?.origin).toBe('generated');
    });

    it('should not open a second one when the current cover is uploaded again', async () => {
      const projectId = await seedProject('illustration-uploaded-cover-again');
      const ref = await uploadCover(projectId);
      await projectService().setCoverRef(projectId, ref);

      expect(await coverIllustrations(projectId)).toHaveLength(1);
    });

    it('should open a new one for a replacement upload', async () => {
      const projectId = await seedProject('illustration-uploaded-cover-replace');
      await uploadCover(projectId);
      const replacement = await uploadCover(projectId, 'b3RoZXI=');

      const rows = await coverIllustrations(projectId);
      expect(rows).toHaveLength(2);
      expect(rows[0]?.selectedRef).toBe(replacement);
    });

    it('should leave the illustrations untouched when the cover is cleared', async () => {
      const projectId = await seedProject('illustration-uploaded-cover-clear');
      await uploadCover(projectId);

      await projectService().clearCover(projectId);

      expect((await coverIllustrations(projectId)).map(row => row.status)).toEqual(['active']);
    });

    it('should refine an uploaded cover from the upload and save the result as the cover', async () => {
      const projectId = await seedProject('illustration-uploaded-cover-refine');
      const ref = await uploadCover(projectId);
      const [adopted] = await harness.service.list(projectId);

      const refined = await harness.service.refine(projectId, adopted!.id, { add: 'warmer palette' });
      expect(harness.composePrompts).toHaveLength(0);
      expect(harness.imageRequests[0]?.input_references).toHaveLength(1);
      expect(harness.imageRequests[0]?.prompt).toContain('warmer palette');
      expect(refined.candidates).toHaveLength(3);

      const pick = refined.candidates[1]!.ref;
      await harness.service.select(projectId, adopted!.id, pick);
      await harness.service.save(projectId, adopted!.id, 'cover');

      const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      expect(project?.coverImagePath).toBe(pick);
      expect(harness.deleted).toContain(ref);
      expect(await coverIllustrations(projectId)).toHaveLength(1);
    });

    it('should reopen an upload that a refined illustration left behind as a stale candidate', async () => {
      const projectId = await seedProject('illustration-uploaded-cover-stale');
      const original = await uploadCover(projectId);
      const [adopted] = await harness.service.list(projectId);
      const refined = await harness.service.refine(projectId, adopted!.id, { add: 'warmer palette' });
      await harness.service.select(projectId, adopted!.id, refined.candidates[1]!.ref);
      await harness.service.save(projectId, adopted!.id, 'cover');

      await projectService().setCoverRef(projectId, original);

      const rows = await coverIllustrations(projectId);
      expect(rows.map(row => [row.status, row.selectedRef])).toEqual([
        ['active', original],
        ['saved', refined.candidates[1]!.ref],
      ]);
      expect(rows[1]?.candidates.map(candidate => candidate.ref)).toContain(original);
    });

    it('should open a fresh one when the cover is set back to an image whose illustration is saved', async () => {
      const projectId = await seedProject('illustration-saved-cover-reset');
      const started = await harness.service.start(projectId, { subjectType: 'cover' });
      const ref = started.candidates[0]!.ref;
      await harness.service.select(projectId, started.id, ref);
      await harness.service.save(projectId, started.id, 'cover');

      await projectService().setCoverRef(projectId, ref);

      const rows = await coverIllustrations(projectId);
      expect(rows.map(row => [row.status, row.selectedRef])).toEqual([
        ['active', ref],
        ['saved', ref],
      ]);
      expect(rows[0]?.promptSpec.promptKey).toBe('uploaded-cover');
    });

    it('should keep the cover object on discard and reopen the cover when it is uploaded again', async () => {
      const projectId = await seedProject('illustration-uploaded-cover-discard');
      const ref = await uploadCover(projectId);
      const [adopted] = await harness.service.list(projectId);

      await harness.service.discard(projectId, adopted!.id);
      expect(harness.deleted).not.toContain(ref);

      await projectService().setCoverRef(projectId, ref);
      expect((await coverIllustrations(projectId)).map(row => row.status)).toEqual(['active', 'discarded']);
    });
  });

  describe('0034 candidate reference backfill', () => {
    const backfill = readFileSync(resolve(import.meta.dir, '../../generated/drizzle/0034_backfill_candidate_references.sql'), 'utf-8');

    it('should add an empty reference snapshot to candidates that lack one, once however often it runs', async () => {
      const projectId = await seedProject('illustration-backfill-0034');
      const snapshot = [{ source: 'cover', ref: 'ref-cover', role: 'style', origin: 'attached', reason: 'attached' }];
      const [row] = await db
        .insert(schema.illustrations)
        .values({
          projectId,
          subjectType: 'cover',
          promptSpec: uploadedCoverPromptSpec(),
          candidates: [
            { ref: 'ref-old', createdAt: new Date().toISOString(), instructionsHash: 'x', referenceRefs: ['ref-cover'] },
            { ref: 'ref-new', createdAt: new Date().toISOString(), instructionsHash: 'y', referenceRefs: ['ref-cover'], references: snapshot },
          ] as never,
        })
        .returning();

      await db.execute(sql.raw(backfill));
      await db.execute(sql.raw(backfill));

      const stored = await db.query.illustrations.findFirst({ where: eq(schema.illustrations.id, row!.id) });
      expect(stored?.candidates.map(candidate => [candidate.ref, candidate.referenceRefs, candidate.references])).toEqual([
        ['ref-old', ['ref-cover'], []],
        ['ref-new', ['ref-cover'], snapshot],
      ]);
    });
  });

  describe('0032 uploaded cover backfill', () => {
    const backfill = readFileSync(resolve(import.meta.dir, '../../generated/drizzle/0032_backfill_uploaded_cover_illustrations.sql'), 'utf-8');

    async function seedCover(name: string, ref: string): Promise<bigint> {
      const projectId = await seedProject(name);
      await db.update(schema.projects).set({ coverImagePath: ref }).where(eq(schema.projects.id, projectId));
      return projectId;
    }

    it('should backfill the same record setProjectCover writes, once however often it runs', async () => {
      const projectId = await seedCover('illustration-backfill', `ref-backfill-${Date.now()}`);
      const expected = await seedProject('illustration-backfill-expected');
      await setProjectCover(db, expected, `ref-backfill-expected-${Date.now()}`);

      await db.execute(sql.raw(backfill));
      await db.execute(sql.raw(backfill));

      const [row] = await coverIllustrations(projectId);
      const [reference] = await coverIllustrations(expected);
      expect(await coverIllustrations(projectId)).toHaveLength(1);
      expect(await coverIllustrations(expected)).toHaveLength(1);
      expect(row?.promptSpec).toEqual(reference!.promptSpec);
      expect(row).toMatchObject({ status: 'active', subjectKey: null, revision: 1, selectedRef: row?.candidates[0]?.ref });
      expect(row?.candidates[0]?.instructionsHash).toBe(reference!.candidates[0]!.instructionsHash);
      expect(new Date(row!.candidates[0]!.createdAt).toISOString()).toBe(row!.candidates[0]!.createdAt);
    });

    it('should skip a project whose cover a generated illustration already holds', async () => {
      const projectId = await seedProject('illustration-backfill-generated');
      const started = await harness.service.start(projectId, { subjectType: 'cover' });
      await harness.service.select(projectId, started.id, started.candidates[0]!.ref);
      await harness.service.save(projectId, started.id, 'cover');

      await db.execute(sql.raw(backfill));

      expect(await coverIllustrations(projectId)).toHaveLength(1);
    });
  });

  it('should refuse to touch an illustration owned by another project', async () => {
    const mine = await seedProject('illustration-owner-mine');
    const theirs = await seedProject('illustration-owner-theirs');
    await seedEntity(mine, 'hero', 'Evan Vale', 'silver hair');

    const started = await harness.service.start(mine, { subjectType: 'entity', subjectKey: 'hero' });

    expect(harness.service.refine(theirs, started.id, { add: 'more snow' })).rejects.toThrow();
    expect(harness.service.select(theirs, started.id, started.candidates[0]!.ref)).rejects.toThrow();
    expect(harness.service.discard(theirs, started.id)).rejects.toThrow();
    expect(await harness.service.list(theirs)).toHaveLength(0);
  });

  it('should look up the entity within the requesting project only', async () => {
    const mine = await seedProject('illustration-scope-mine');
    const theirs = await seedProject('illustration-scope-theirs');
    await seedEntity(mine, 'hero', 'Evan Vale', 'silver hair, scarred jaw');
    await seedEntity(theirs, 'hero', 'Someone Else', 'bald, gold tooth');

    await harness.service.start(mine, { subjectType: 'entity', subjectKey: 'hero' });

    expect(harness.imageRequests[0]?.prompt).toContain('silver hair, scarred jaw');
    expect(harness.imageRequests[0]?.prompt).not.toContain('gold tooth');
  });

  it('should reject an entity subject with no key and a chapter subject with a non-numeric key', async () => {
    const projectId = await seedProject('illustration-subject-key');

    expect(harness.service.start(projectId, { subjectType: 'entity' })).rejects.toThrow();
    expect(harness.service.start(projectId, { subjectType: 'chapter', subjectKey: 'three' })).rejects.toThrow();
  });

  it('should route the image call through the image model group by default', async () => {
    const projectId = await seedProject('illustration-default-model');
    await harness.service.start(projectId, { subjectType: 'cover' });

    expect(harness.imageRequests[0]?.model).toBe(getProfileDefaults()['image'].model);
  });

  it("should honour the project's image model override", async () => {
    const projectId = await seedProject('illustration-override-model', { models: { image: { provider: 'openrouter', model: 'openai/gpt-5.4-image-2' } } });
    await harness.service.start(projectId, { subjectType: 'cover' });

    expect(harness.imageRequests[0]?.model).toBe('openai/gpt-5.4-image-2');
  });

  it('should keep Unrestricted projects on the Grok image model rather than its writing model', async () => {
    const projectId = await seedProject('illustration-unrestricted', null, 'unrestricted');
    await harness.service.start(projectId, { subjectType: 'cover' });

    expect(harness.imageRequests[0]?.model).toBe('x-ai/grok-imagine-image-2.0');
  });

  it('should record a model_calls row for the image call', async () => {
    const projectId = await seedProject('illustration-telemetry');
    await harness.service.start(projectId, { subjectType: 'cover' });

    const calls = await db.query.modelCalls.findMany({ where: and(eq(schema.modelCalls.projectId, projectId), eq(schema.modelCalls.role, 'image')) });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.status).toBe('ok');
    expect(calls[0]?.promptKey).toBe('illustration-compose');
  });
  describe('references', () => {
    function dataUrl(text: string, contentType = 'image/png'): string {
      return `data:${contentType};base64,${Buffer.from(text).toString('base64')}`;
    }

    function sentImages(request: ImageRequest | undefined): string[] {
      return ((request?.input_references ?? []) as { image_url: { url: string } }[]).map(reference => reference.image_url.url);
    }

    async function setPortrait(projectId: bigint, entityKey: string, text = 'portrait'): Promise<string> {
      const ref = harness.put(text);
      await db
        .update(schema.entities)
        .set({ imagePath: ref })
        .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)));
      return ref;
    }

    async function setCover(projectId: bigint, text = 'cover'): Promise<string> {
      const ref = harness.put(text);
      await db.update(schema.projects).set({ coverImagePath: ref }).where(eq(schema.projects.id, projectId));
      return ref;
    }

    function storedRow(id: bigint): Promise<Illustration.Row | undefined> {
      return db.query.illustrations.findFirst({ where: eq(schema.illustrations.id, id) });
    }

    it('should send an attached cover, persist it and name it in both the compose input and the image prompt', async () => {
      const projectId = await seedProject('illustration-ref-cover');
      const coverRef = await setCover(projectId);

      const started = await harness.service.start(projectId, { subjectType: 'cover', references: [{ source: 'cover', role: 'style', note: '  palette only  ' }] });

      expect(sentImages(harness.imageRequests[0])).toEqual([dataUrl('cover')]);
      expect(harness.imageRequests[0]?.prompt).toContain('Reference images (in the order attached):\nReference image 1 — style — note: palette only\n');
      expect(harness.imageRequests[0]?.prompt).not.toContain('project cover');
      expect(harness.composePrompts[0]).toContain('Reference 1 — style — the project cover — note: palette only');
      expect(started.prompt).toBe(harness.imageRequests[0]!.prompt);
      expect(started.references).toEqual([
        {
          source: 'cover',
          ref: coverRef,
          role: 'style',
          note: 'palette only',
          origin: 'attached',
          reason: 'attached',
          label: 'the project cover',
          url: `https://cdn.test/${coverRef}`,
        },
      ]);
      expect(started.candidates.map(candidate => candidate.referenceRefs)).toEqual([[coverRef], [coverRef]]);
      expect(started.candidates[0]?.references).toEqual(started.references);
      expect(started.attachedReferences).toEqual([{ source: 'cover', role: 'style', note: 'palette only' }]);
      expect(started.referenceWarnings).toEqual([]);

      const stored = await storedRow(started.id);
      expect(stored?.references.map(reference => reference.ref)).toEqual([coverRef]);
      expect(stored?.promptSpec).toMatchObject({ promptVersion: '1.1.0', attachedReferences: [{ source: 'cover', role: 'style', note: 'palette only' }], autoReferences: true });
    });

    it("should auto-attach an entity's portrait as a likeness reference without describing an entity that has an appearance", async () => {
      const projectId = await seedProject('illustration-ref-auto');
      await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair, scarred jaw');
      const portraitRef = await setPortrait(projectId, 'hero');

      const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });

      expect(sentImages(harness.imageRequests[0])).toEqual([dataUrl('portrait')]);
      expect(harness.imageRequests[0]?.prompt).toContain('Reference image 1 — likeness — Evan Vale');
      expect(harness.composePrompts[0]).toContain('Reference 1 — likeness — portrait of Evan Vale');
      expect(started.references).toMatchObject([{ ref: portraitRef, origin: 'auto', reason: 'auto:entity-portrait' }]);
      expect(harness.describeCalls).toHaveLength(0);
      expect(started.appearanceDescription).toBeUndefined();
    });

    it('should send no references and store the opt-out when auto references are off', async () => {
      const projectId = await seedProject('illustration-ref-auto-off');
      await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
      await setPortrait(projectId, 'hero');

      const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero', autoReferences: false });

      expect(sentImages(harness.imageRequests[0])).toEqual([]);
      expect(harness.imageRequests[0]?.prompt).not.toContain('Reference images');
      expect(started.references).toEqual([]);
      expect(started.autoReferences).toBe(false);
      expect((await storedRow(started.id))?.promptSpec.autoReferences).toBe(false);
    });

    it('should refuse a client-sent edit-source role in the DTO and in the service', async () => {
      expect(parseSchema(StartIllustrationBody, { subjectType: 'cover', references: [{ source: 'cover', role: 'edit-source' }] }).success).toBe(false);
      expect(parseSchema(UpdateIllustrationReferencesBody, { references: [{ source: 'cover', role: 'edit-source' }] }).success).toBe(false);
      expect(parseSchema(StartIllustrationBody, { subjectType: 'cover', references: [{ source: 'cover', role: 'style', note: 'x'.repeat(301) }] }).success).toBe(false);
      expect(parseSchema(StartIllustrationBody, { subjectType: 'cover', references: Array.from({ length: 9 }, () => ({ source: 'cover', role: 'style' })) }).success).toBe(false);
      expect(parseSchema(StartIllustrationBody, { subjectType: 'cover', references: [{ source: 'cover', role: 'style', note: 'palette' }], autoReferences: false }).success).toBe(
        true,
      );

      const projectId = await seedProject('illustration-ref-edit-source');
      await setCover(projectId);
      await expect(harness.service.start(projectId, { subjectType: 'cover', references: [{ source: 'cover', role: 'edit-source' as 'style' }] })).rejects.toMatchObject({
        code: 'ILL_015',
      });
      expect(harness.imageRequests).toHaveLength(0);
    });

    it('should refine at capacity one by sending the edit source and trimming the start-attached reference with a warning', async () => {
      const projectId = await seedProject('illustration-ref-refine-carried');
      const coverRef = await setCover(projectId);
      const started = await harness.service.start(projectId, { subjectType: 'cover', references: [{ source: 'cover', role: 'style' }] });
      const editSourceRef = started.candidates[1]!.ref;

      const refined = await harness.service.refine(projectId, started.id, { add: 'warmer light' });

      expect(sentImages(harness.imageRequests[1])).toEqual([dataUrl('png-1-1')]);
      expect(harness.imageRequests[1]?.prompt).toContain('Reference image 1 — edit-source');
      expect(harness.imageRequests[1]?.prompt).not.toContain('the project cover');
      expect(refined.prompt).toBe(harness.imageRequests[1]!.prompt);
      expect(refined.referenceWarnings).toMatchObject([{ code: 'capacity-trimmed', source: 'cover' }]);
      expect(refined.candidates.slice(-2).map(candidate => candidate.referenceRefs)).toEqual([[editSourceRef], [editSourceRef]]);
      expect(refined.references.map(reference => [reference.role, reference.ref])).toEqual([
        ['style', coverRef],
        ['edit-source', editSourceRef],
      ]);
      expect(refined.attachedReferences).toEqual([{ source: 'cover', role: 'style' }]);
    });

    it('should validate and store a replacement reference set without generating, then refine from it', async () => {
      const projectId = await seedProject('illustration-ref-update');
      await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
      await seedEntity(projectId, 'faceless', 'Nobody', 'plain');
      const coverRef = await setCover(projectId);
      const portraitRef = await setPortrait(projectId, 'hero');
      const started = await harness.service.start(projectId, { subjectType: 'cover', references: [{ source: 'cover', role: 'style' }] });

      await expect(harness.service.updateReferences(projectId, started.id, { references: [{ source: 'portrait', sourceId: 'hero', role: 'likeness' }] })).rejects.toMatchObject({
        code: 'ILL_011',
      });
      await expect(harness.service.updateReferences(projectId, started.id, { references: [{ source: 'portrait', sourceId: 'faceless', role: 'likeness' }] })).rejects.toMatchObject(
        {
          code: 'ILL_010',
        },
      );

      const readsBefore = harness.reads.length;
      const kept = await harness.service.updateReferences(projectId, started.id, {
        references: [{ source: 'cover', role: 'likeness', note: 'the knight' }],
        autoReferences: false,
      });
      expect(harness.reads).toHaveLength(readsBefore);
      expect(harness.imageRequests).toHaveLength(1);
      expect(kept.referenceWarnings).toMatchObject([{ code: 'capacity-trimmed', source: 'cover' }]);
      expect(kept.attachedReferences).toEqual([{ source: 'cover', role: 'likeness', note: 'the knight' }]);
      expect(kept.autoReferences).toBe(false);
      expect(kept.references.map(reference => reference.ref)).toEqual([coverRef]);

      const cleared = await harness.service.updateReferences(projectId, started.id, { references: [] });
      expect(cleared.autoReferences).toBe(false);
      const refined = await harness.service.refine(projectId, started.id, { add: 'dusk' });
      expect(refined.referenceWarnings).toEqual([]);
      expect(refined.references.map(reference => reference.ref)).not.toContain(portraitRef);
    });

    it('should describe a likeness reference once for an entity without an appearance and anchor on it', async () => {
      const projectId = await seedProject('illustration-ref-describe');
      await seedEntity(projectId, 'hero', 'Evan Vale');
      await setPortrait(projectId, 'hero');
      harness.describe = async () => ({ appearance: 'broad-shouldered, close-cropped black hair', confidence: 'medium', ambiguity: 'two figures; chose the nearer' });
      harness.compose = { ...harness.compose, appearance: 'invented by the composer' };

      const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
      await harness.service.refine(projectId, started.id, { add: 'in rain' });

      expect(harness.describeCalls).toHaveLength(1);
      expect(harness.describeCalls[0]).toMatchObject({ projectId, imageDataUrl: dataUrl('portrait'), subjectLabel: 'Evan Vale' });
      expect(harness.composePrompts[0]).toContain('Appearance described from Reference 1 (likeness): broad-shouldered, close-cropped black hair');
      expect(harness.imageRequests[0]?.prompt).toContain('Subject appearance (must match exactly): broad-shouldered, close-cropped black hair');
      expect(started.suggestedAppearance).toBe('broad-shouldered, close-cropped black hair');
      expect(started.appearanceDescription).toEqual({ confidence: 'medium', ambiguity: 'two figures; chose the nearer' });
      const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'hero')) });
      expect(entity?.appearance).toBeNull();
    });

    it('should carry on without a description when the describer fails', async () => {
      const projectId = await seedProject('illustration-ref-describe-fail');
      await seedEntity(projectId, 'hero', 'Evan Vale');
      await setPortrait(projectId, 'hero');
      harness.describe = async () => {
        throw AppErrorCode.AI_011.create({ model: 'vision-model' });
      };
      harness.compose = { ...harness.compose, appearance: 'gaunt, ash-blond' };

      const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });

      expect(harness.describeCalls).toHaveLength(1);
      expect(harness.imageRequests).toHaveLength(1);
      expect(started.suggestedAppearance).toBe('gaunt, ash-blond');
      expect(started.appearanceDescription).toBeUndefined();
    });

    async function withCapacity<T>(capacity: number, run: () => Promise<T>): Promise<T> {
      const entry = MODEL_MAP[getProfileDefaults()['image'].model]!;
      const previous = entry.maxInputReferences;
      entry.maxInputReferences = capacity;
      try {
        return await run();
      } finally {
        entry.maxInputReferences = previous;
      }
    }

    async function useEditSource(illustrationId: bigint, ref: string): Promise<void> {
      const row = await storedRow(illustrationId);
      const candidate = { ref, createdAt: new Date().toISOString(), instructionsHash: 'x', referenceRefs: [], references: [] };
      await db
        .update(schema.illustrations)
        .set({ selectedRef: ref, candidates: [...row!.candidates, candidate] })
        .where(eq(schema.illustrations.id, illustrationId));
    }

    for (const mebibytes of [6, 10]) {
      it(`should refine from a ${mebibytes} MiB edit source and skip optional references that no longer fit`, async () => {
        const projectId = await seedProject(`illustration-ref-large-edit-${mebibytes}`);
        await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
        await db
          .update(schema.entities)
          .set({ imagePath: harness.put(new Uint8Array(3 * 1024 * 1024)) })
          .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'hero')));
        await db
          .update(schema.projects)
          .set({ coverImagePath: harness.put(new Uint8Array(3 * 1024 * 1024)) })
          .where(eq(schema.projects.id, projectId));

        await withCapacity(3, async () => {
          const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero', references: [{ source: 'cover', role: 'style' }] });
          const editSourceRef = harness.put(new Uint8Array(mebibytes * 1024 * 1024));
          await useEditSource(started.id, editSourceRef);

          const refined = await harness.service.refine(projectId, started.id, { add: 'at dusk' });

          expect(harness.imageRequests[1]?.input_references).toHaveLength(1);
          expect(refined.candidates.at(-1)?.referenceRefs).toEqual([editSourceRef]);
          expect(refined.referenceWarnings.map(warning => [warning.code, warning.source])).toEqual([
            ['too-large', 'cover'],
            ['too-large', 'portrait'],
          ]);
        });
      });
    }

    it('should still send an edit source whose content type is off the reference allowlist', async () => {
      const projectId = await seedProject('illustration-ref-edit-jpg');
      const started = await harness.service.start(projectId, { subjectType: 'cover' });
      await useEditSource(started.id, harness.put('jpg-bytes', 'image/jpg'));

      await harness.service.refine(projectId, started.id, { add: 'grain' });

      expect(sentImages(harness.imageRequests[1])).toEqual([dataUrl('jpg-bytes', 'image/jpg')]);
    });

    it('should refuse a new attachment that does not fit beside a large edit source, but accept clearing the set', async () => {
      const projectId = await seedProject('illustration-ref-edit-budget');
      await db
        .update(schema.projects)
        .set({ coverImagePath: harness.put(new Uint8Array(3 * 1024 * 1024)) })
        .where(eq(schema.projects.id, projectId));

      await withCapacity(3, async () => {
        const started = await harness.service.start(projectId, { subjectType: 'cover' });
        await useEditSource(started.id, harness.put(new Uint8Array(6 * 1024 * 1024)));

        await expect(harness.service.updateReferences(projectId, started.id, { references: [{ source: 'cover', role: 'style' }] })).rejects.toMatchObject({ code: 'ILL_013' });
        const cleared = await harness.service.updateReferences(projectId, started.id, { references: [] });
        expect(cleared.attachedReferences).toEqual([]);
      });
    });

    it('should keep a references update committed while a refinement was generating', async () => {
      const projectId = await seedProject('illustration-ref-race');
      await setCover(projectId);

      await withCapacity(3, async () => {
        const started = await harness.service.start(projectId, { subjectType: 'cover', instruction: 'moonlit' });
        harness.onImageRequest = async () => {
          harness.onImageRequest = undefined;
          await harness.service.updateReferences(projectId, started.id, { references: [{ source: 'cover', role: 'style', note: 'palette' }], autoReferences: false });
        };

        const refined = await harness.service.refine(projectId, started.id, { add: 'fog' });

        const stored = await storedRow(started.id);
        expect(stored?.promptSpec).toMatchObject({
          instructions: ['moonlit', 'fog'],
          attachedReferences: [{ source: 'cover', role: 'style', note: 'palette' }],
          autoReferences: false,
        });
        expect(refined.attachedReferences).toEqual([{ source: 'cover', role: 'style', note: 'palette' }]);
      });
    });

    it('should send, snapshot and ledger references in priority order when the model has slots for all of them', async () => {
      const projectId = await seedProject('illustration-ref-order');
      const heroId = await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
      const coverRef = await setCover(projectId);
      const portraitRef = await setPortrait(projectId, 'hero');
      const galleryRef = harness.put('gallery');
      const [gallery] = await db.insert(schema.entityImages).values({ entityId: heroId, projectId, imagePath: galleryRef, caption: 'at the gate' }).returning();
      const galleryRequest = { source: 'gallery' as const, sourceId: String(gallery!.id), role: 'likeness' as const, note: 'the left figure' };

      await withCapacity(4, async () => {
        const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero', references: [galleryRequest] });
        const editSourceRef = started.candidates[1]!.ref;
        await harness.service.updateReferences(projectId, started.id, { references: [galleryRequest, { source: 'cover', role: 'style' }] });

        const refined = await harness.service.refine(projectId, started.id, { add: 'in rain' });

        expect(sentImages(harness.imageRequests[1])).toEqual([dataUrl('png-1-1'), dataUrl('gallery'), dataUrl('cover'), dataUrl('portrait')]);
        const newest = refined.candidates.slice(-2);
        expect(newest.map(candidate => candidate.referenceRefs)).toEqual([
          [editSourceRef, galleryRef, coverRef, portraitRef],
          [editSourceRef, galleryRef, coverRef, portraitRef],
        ]);
        expect(newest[0]?.references.map(reference => [reference.role, reference.origin, reference.reason, reference.note])).toEqual([
          ['edit-source', 'auto', 'auto:edit-source', undefined],
          ['likeness', 'attached', 'attached', 'the left figure'],
          ['style', 'attached', 'attached', undefined],
          ['likeness', 'auto', 'auto:entity-portrait', undefined],
        ]);
        expect(refined.candidates[0]?.referenceRefs).toEqual([galleryRef, portraitRef]);
        expect(refined.references.map(reference => reference.ref)).toEqual([galleryRef, portraitRef, editSourceRef, coverRef]);

        const prompt = harness.imageRequests[1]!.prompt;
        expect(prompt).toContain(
          'Reference image 1 — edit-source\nReference image 2 — likeness — note: the left figure\nReference image 3 — style\nReference image 4 — likeness — Evan Vale',
        );
        expect(prompt).not.toContain('at the gate');
        expect(refined.prompt).toBe(prompt);
      });
    });

    it('should rethrow a programming error from the describer but tolerate other failures', async () => {
      const projectId = await seedProject('illustration-ref-describe-bug');
      await seedEntity(projectId, 'hero', 'Evan Vale');
      await setPortrait(projectId, 'hero');

      harness.describe = async () => {
        throw new TypeError('cannot read properties of undefined');
      };
      await expect(harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' })).rejects.toBeInstanceOf(TypeError);

      harness.describe = async () => {
        throw new Error('socket hang up');
      };
      const started = await harness.service.start(projectId, { subjectType: 'entity', subjectKey: 'hero' });
      expect(started.candidates).toHaveLength(2);
    });

    it('should keep only the first attachment for a repeated source', async () => {
      const projectId = await seedProject('illustration-ref-dedupe');
      await setCover(projectId);

      const started = await harness.service.start(projectId, {
        subjectType: 'cover',
        references: [
          { source: 'cover', role: 'style', note: 'palette' },
          { source: 'cover', role: 'likeness', note: 'the knight' },
        ],
      });

      expect(started.attachedReferences).toEqual([{ source: 'cover', role: 'style', note: 'palette' }]);
    });

    it('should list attachable images scoped to the project with an auto preview and no byte reads', async () => {
      const projectId = await seedProject('illustration-ref-options');
      const other = await seedProject('illustration-ref-options-other');
      const heroId = await seedEntity(projectId, 'hero', 'Evan Vale', 'silver hair');
      await seedEntity(projectId, 'mara', 'Mara', 'black braid');
      await seedEntity(other, 'stranger', 'Stranger', 'bald');
      const coverRef = await setCover(projectId);
      const portraitRef = await setPortrait(projectId, 'hero');
      await setPortrait(projectId, 'mara');
      await setPortrait(other, 'stranger');
      const [gallery] = await db
        .insert(schema.entityImages)
        .values({ entityId: heroId, projectId, imagePath: harness.put('gallery'), caption: 'at the gate' })
        .returning();
      const [scene] = await db
        .insert(schema.chapterImages)
        .values({ projectId, chapter: 2, imagePath: harness.put('scene') })
        .returning();
      const started = await harness.service.start(projectId, { subjectType: 'cover', autoReferences: false });
      await harness.service.select(projectId, started.id, started.candidates[0]!.ref);
      const readsBefore = harness.reads.length;

      const options = await harness.service.referenceOptions(projectId, { subjectType: 'entity', subjectKey: 'hero' });

      expect(harness.reads).toHaveLength(readsBefore);
      expect(options.capacity).toBe(1);
      expect(options.cover).toEqual({ source: 'cover', label: 'the project cover', url: `https://cdn.test/${coverRef}` });
      expect(options.portraits.map(option => option.sourceId)).toEqual(['hero', 'mara']);
      expect(options.gallery).toEqual([
        {
          source: 'gallery',
          sourceId: String(gallery!.id),
          label: 'gallery image of Evan Vale, captioned "at the gate"',
          url: expect.any(String),
          entityKey: 'hero',
          caption: 'at the gate',
        },
      ]);
      expect(options.chapterImages).toMatchObject([{ source: 'chapter-image', sourceId: String(scene!.id), chapter: 2 }]);
      expect(options.candidates).toMatchObject([{ source: 'candidate', sourceId: String(started.id), subjectType: 'cover' }]);
      expect(options.truncated).toBe(false);
      expect(options.autoPreview).toMatchObject([
        { source: 'portrait', sourceId: 'hero', ref: portraitRef, reason: 'auto:entity-portrait', url: `https://cdn.test/${portraitRef}` },
      ]);

      const limited = await harness.service.referenceOptions(projectId, { subjectType: 'cover', limit: 1 });
      expect(limited.portraits.map(option => option.sourceId)).toEqual(['hero']);
      expect(limited.truncated).toBe(true);
      expect(limited.autoPreview).toEqual([]);
      expect(harness.service.referenceOptions(projectId, { subjectType: 'entity' })).rejects.toMatchObject({ code: 'ILL_006' });
    });
  });
});
