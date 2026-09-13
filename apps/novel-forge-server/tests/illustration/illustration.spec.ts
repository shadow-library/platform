import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config } from '@shadow-library/common';

import { ProjectEventService } from '@modules/events';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { CatalogService } from '@modules/ai/context/catalog.service';
import { getProfileDefaults } from '@modules/ai/defaults';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { EntityService } from '@modules/bible/entity/entity.service';
import { ChapterImageService } from '@modules/generation/chapter-image.service';
import { IllustrationModule } from '@modules/illustration/illustration.module';
import { IllustrationService } from '@modules/illustration/illustration.service';
import { applyInstructionEdit, hashInstructions, renderPromptSpec } from '@modules/illustration/prompt-spec';
import { setProjectCover, uploadedCoverPromptSpec } from '@modules/illustration/uploaded-cover';
import { ProjectService } from '@modules/project/project/project.service';
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
  compose: { basePrompt: string; subjectFraming: string; styleNotes: string; appearance?: string };
}

// Object storage itself (content-addressing, public URLs, the local/S3 providers) is exercised in
// `@shadow-library/modules`' storage-module suite; here it is a map from ref to bytes so the
// image-to-image reference path can be asserted without a provider.
function buildHarness(db: PrimaryDatabase): Harness {
  const objects = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  // Refs are unique per harness: every test in the file shares one database, so a per-test counter alone
  // would collide with an earlier test's rows and make the reference check keep an object alive.
  const prefix = `ref-${Math.random().toString(36).slice(2)}`;
  let saved = 0;
  const storage = {
    save: async (bytes: Uint8Array) => {
      const ref = `${prefix}-${++saved}`;
      objects.set(ref, bytes);
      return ref;
    },
    read: async (ref: string) => ({ bytes: objects.get(ref) ?? new Uint8Array(), contentType: 'image/png' }),
    delete: async (ref: string) => void deleted.push(ref),
    getPublicUrl: (ref?: string | null) => (ref ? `https://cdn.test/${ref}` : undefined),
  };

  const harness: Harness = {
    imageRequests: [],
    composePrompts: [],
    deleted,
    compose: { basePrompt: 'a lone swordsman on a frozen ridge, backlit', subjectFraming: 'half-body portrait, shallow depth of field', styleNotes: 'ink wash, muted palette' },
    service: undefined as unknown as IllustrationService,
    storage,
  };

  const dbStub = { getPostgresClient: () => db } as never;
  const router = new ModelRouterService({} as never, dbStub, { enforce: async () => undefined } as never, { defaultsFor: async () => undefined } as never);
  const assembler = new ContextAssembler(dbStub, new CatalogService(dbStub));
  const workflowRuns = new WorkflowRunService(dbStub, assembler, router, {} as never, {} as never, {} as never, {} as never, new ProjectEventService());
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
  );

  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (String(url).endsWith('/images')) {
      harness.imageRequests.push(body as unknown as ImageRequest);
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
      candidates: [{ ref: first.candidates[0]!.ref, createdAt: new Date().toISOString(), instructionsHash: 'x', referenceRefs: [] }],
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
      expect(rows[0]?.candidates).toEqual([{ ref, createdAt: expect.any(String), instructionsHash: hashInstructions([]), referenceRefs: [] }]);

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
});
