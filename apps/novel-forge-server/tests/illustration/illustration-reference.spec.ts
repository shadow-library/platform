import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { drizzle } from 'drizzle-orm/bun-sql';
import { StorageErrorCode } from '@shadow-library/modules';

import { ModelRouterService } from '@modules/ai/model-router.service';
import {
  IllustrationReferenceService,
  MAX_REFERENCE_BYTES,
  MAX_REFERENCE_REQUEST_BYTES,
  type ReferenceRequest,
  type ResolveReferencesInput,
} from '@modules/illustration/illustration-reference.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_illustration_reference`;

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

interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

interface Harness {
  put(bytes?: Uint8Array | string, contentType?: string): string;
  resolve(input: Partial<ResolveReferencesInput> & { projectId: bigint }): ReturnType<IllustrationReferenceService['resolve']>;
  setCapacity(capacity: number | undefined): void;
}

function buildHarness(db: PrimaryDatabase): Harness {
  const objects = new Map<string, StoredObject>();
  const prefix = `ref-${Math.random().toString(36).slice(2)}`;
  let saved = 0;
  const storage = {
    stat: async (ref: string) => {
      const object = objects.get(ref);
      if (!object) throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref });
      return { size: object.bytes.byteLength, contentType: object.contentType };
    },
    read: async (ref: string) => {
      const object = objects.get(ref);
      if (!object) throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref });
      return object;
    },
  };

  let capacity: number | undefined;
  const dbStub = { getPostgresClient: () => db } as never;
  const router = new ModelRouterService({} as never, dbStub, { enforce: async () => undefined } as never, { defaultsFor: async () => undefined } as never);
  const realCapacity = router.referenceCapacity.bind(router);
  router.referenceCapacity = (project, projectId) => (capacity === undefined ? realCapacity(project, projectId) : Promise.resolve(capacity));
  const service = new IllustrationReferenceService(dbStub, storage as never, router);

  return {
    put: (bytes = `image-${saved + 1}`, contentType = 'image/png') => {
      const ref = `${prefix}-${++saved}.png`;
      objects.set(ref, { bytes: typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes, contentType });
      return ref;
    },
    resolve: input => service.resolve({ subjectType: 'cover', subjectKey: null, attached: [], autoReferences: true, ...input }),
    setCapacity: value => {
      capacity = value;
    },
  };
}

function dataUrl(text: string, contentType = 'image/png'): string {
  return `data:${contentType};base64,${Buffer.from(text).toString('base64')}`;
}

describe.if(pgAvailable)('IllustrationReferenceService', () => {
  let db: PrimaryDatabase;
  let harness: Harness;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  beforeEach(() => {
    harness = buildHarness(db);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(coverImagePath: string | null = null): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `reference-${Date.now()}-${Math.random()}`, kind: 'source', premise: 'A frozen empire eats its heirs.', coverImagePath })
      .returning();
    return project!.id;
  }

  interface EntitySeed {
    key: string;
    imagePath?: string | null;
    significance?: 'major' | 'minor' | null;
    type?: 'character' | 'location';
  }

  async function seedEntity(projectId: bigint, seed: EntitySeed): Promise<bigint> {
    const [entity] = await db
      .insert(schema.entities)
      .values({ projectId, entityKey: seed.key, type: seed.type ?? 'character', name: seed.key, imagePath: seed.imagePath ?? null, significance: seed.significance ?? null })
      .returning();
    return entity!.id;
  }

  async function seedCast(projectId: bigint, chapter: number, seeds: EntitySeed[]): Promise<void> {
    for (const seed of seeds) {
      const entityId = await seedEntity(projectId, seed);
      await db.insert(schema.entityAppearances).values({ entityId, projectId, chapter });
    }
  }

  async function seedGallery(projectId: bigint, imagePath: string): Promise<bigint> {
    const entityId = await seedEntity(projectId, { key: `gallery-${Math.random()}` });
    const [image] = await db.insert(schema.entityImages).values({ entityId, projectId, imagePath }).returning();
    return image!.id;
  }

  async function seedChapterImage(projectId: bigint, imagePath: string): Promise<bigint> {
    const [image] = await db.insert(schema.chapterImages).values({ projectId, chapter: 1, imagePath }).returning();
    return image!.id;
  }

  async function seedIllustration(projectId: bigint, selectedRef: string | null): Promise<bigint> {
    const [row] = await db
      .insert(schema.illustrations)
      .values({
        projectId,
        subjectType: 'cover',
        promptSpec: { basePrompt: 'b', subjectFraming: 'f', styleNotes: 's', instructions: [], promptKey: 'illustration-compose', promptVersion: '1.0.0' },
        candidates: [],
        selectedRef,
      })
      .returning();
    return row!.id;
  }

  function attach(source: ReferenceRequest['source'], sourceId?: string | bigint, role: ReferenceRequest['role'] = 'style', note?: string): ReferenceRequest {
    return { source, ...(sourceId === undefined ? {} : { sourceId: String(sourceId) }), role, ...(note === undefined ? {} : { note }) };
  }

  describe('source resolution', () => {
    it('should resolve the project cover', async () => {
      const ref = harness.put('cover');
      const projectId = await seedProject(ref);

      const resolved = await harness.resolve({ projectId, attached: [attach('cover')] });

      expect(resolved.references).toEqual([{ source: 'cover', ref, role: 'style', origin: 'attached', reason: 'attached' }]);
      expect(resolved.dataUrls).toEqual([dataUrl('cover')]);
    });

    it('should resolve a portrait by entity key', async () => {
      const ref = harness.put();
      const projectId = await seedProject();
      await seedEntity(projectId, { key: 'hero', imagePath: ref });

      const resolved = await harness.resolve({ projectId, attached: [attach('portrait', 'hero', 'likeness', '  the scar only  ')] });

      expect(resolved.references).toEqual([{ source: 'portrait', sourceId: 'hero', ref, role: 'likeness', note: 'the scar only', origin: 'attached', reason: 'attached' }]);
    });

    it('should resolve a gallery image by id', async () => {
      const ref = harness.put();
      const projectId = await seedProject();
      const imageId = await seedGallery(projectId, ref);

      const resolved = await harness.resolve({ projectId, attached: [attach('gallery', imageId)] });

      expect(resolved.references[0]).toMatchObject({ source: 'gallery', sourceId: String(imageId), ref });
    });

    it('should resolve a chapter image by id', async () => {
      const ref = harness.put();
      const projectId = await seedProject();
      const imageId = await seedChapterImage(projectId, ref);

      const resolved = await harness.resolve({ projectId, attached: [attach('chapter-image', imageId)] });

      expect(resolved.references[0]).toMatchObject({ source: 'chapter-image', sourceId: String(imageId), ref });
    });

    it("should resolve a candidate to its illustration's selected ref", async () => {
      const ref = harness.put();
      const projectId = await seedProject();
      const illustrationId = await seedIllustration(projectId, ref);

      const resolved = await harness.resolve({ projectId, attached: [attach('candidate', illustrationId)] });

      expect(resolved.references[0]).toMatchObject({ source: 'candidate', sourceId: String(illustrationId), ref });
    });

    it('should reject a candidate illustration with nothing selected, a portrait-less entity and a cover-less project', async () => {
      const projectId = await seedProject();
      const illustrationId = await seedIllustration(projectId, null);
      await seedEntity(projectId, { key: 'faceless' });

      await expect(harness.resolve({ projectId, attached: [attach('candidate', illustrationId)] })).rejects.toMatchObject({ code: 'ILL_010' });
      await expect(harness.resolve({ projectId, attached: [attach('portrait', 'faceless')] })).rejects.toMatchObject({ code: 'ILL_010' });
      await expect(harness.resolve({ projectId, attached: [attach('cover')] })).rejects.toMatchObject({ code: 'ILL_010' });
    });

    it('should treat a source id from another project exactly like a missing one', async () => {
      const ref = harness.put();
      const theirs = await seedProject();
      const mine = await seedProject();
      await seedEntity(theirs, { key: 'hero', imagePath: ref });
      const galleryId = await seedGallery(theirs, ref);
      const chapterImageId = await seedChapterImage(theirs, ref);
      const illustrationId = await seedIllustration(theirs, ref);

      for (const request of [
        attach('portrait', 'hero'),
        attach('gallery', galleryId),
        attach('chapter-image', chapterImageId),
        attach('candidate', illustrationId),
        attach('gallery', '999999999'),
      ]) {
        await expect(harness.resolve({ projectId: mine, attached: [request] })).rejects.toMatchObject({ code: 'ILL_010', status: 404 });
      }
    });

    it('should reject a malformed source id', async () => {
      const projectId = await seedProject(harness.put());

      for (const request of [
        attach('gallery'),
        attach('gallery', 'abc'),
        attach('chapter-image', '0'),
        attach('candidate', '-4'),
        attach('candidate', '99999999999999999999'),
        attach('candidate', '9223372036854775808'),
        attach('portrait', ' '),
        attach('cover', '1'),
      ]) {
        await expect(harness.resolve({ projectId, attached: [request] })).rejects.toMatchObject({ code: 'ILL_009' });
      }
    });
  });

  describe('auto rules', () => {
    it("should auto-attach an entity subject's portrait as a likeness reference", async () => {
      const ref = harness.put('portrait');
      const projectId = await seedProject(harness.put('cover'));
      await seedEntity(projectId, { key: 'hero', imagePath: ref });

      const resolved = await harness.resolve({ projectId, subjectType: 'entity', subjectKey: 'hero' });

      expect(resolved.references).toEqual([{ source: 'portrait', sourceId: 'hero', ref, role: 'likeness', origin: 'auto', reason: 'auto:entity-portrait' }]);
      expect(resolved.dataUrls).toEqual([dataUrl('portrait')]);
      expect(resolved.warnings).toEqual([]);
    });

    it('should never auto-attach the project cover', async () => {
      const projectId = await seedProject(harness.put('cover'));
      await seedEntity(projectId, { key: 'faceless' });
      harness.setCapacity(5);

      expect((await harness.resolve({ projectId, subjectType: 'cover' })).references).toEqual([]);
      expect((await harness.resolve({ projectId, subjectType: 'entity', subjectKey: 'faceless' })).references).toEqual([]);
    });

    it('should rank chapter cast portraits by significance, skip non-characters and portrait-less entities, and cap at three', async () => {
      const projectId = await seedProject();
      harness.setCapacity(5);
      const refs = { minorA: harness.put(), none: harness.put(), majorB: harness.put(), minorC: harness.put(), majorD: harness.put(), place: harness.put() };
      await seedCast(projectId, 4, [
        { key: 'minor-a', imagePath: refs.minorA, significance: 'minor' },
        { key: 'unranked', imagePath: refs.none },
        { key: 'major-b', imagePath: refs.majorB, significance: 'major' },
        { key: 'bare', significance: 'major' },
        { key: 'minor-c', imagePath: refs.minorC, significance: 'minor' },
        { key: 'major-d', imagePath: refs.majorD, significance: 'major' },
        { key: 'castle', imagePath: refs.place, significance: 'major', type: 'location' },
      ]);
      await seedCast(projectId, 5, [{ key: 'elsewhere', imagePath: harness.put(), significance: 'major' }]);

      const resolved = await harness.resolve({ projectId, subjectType: 'chapter', subjectKey: '4' });

      expect(resolved.references.map(reference => reference.sourceId)).toEqual(['major-b', 'major-d', 'minor-a']);
      expect(resolved.references.every(reference => reference.reason === 'auto:chapter-cast' && reference.role === 'likeness' && reference.origin === 'auto')).toBe(true);
      expect(resolved.warnings).toEqual([]);
    });

    it('should attach nothing automatically when auto references are off, but still send the edit source', async () => {
      const editSourceRef = harness.put('edit');
      const projectId = await seedProject();
      await seedEntity(projectId, { key: 'hero', imagePath: harness.put() });

      const resolved = await harness.resolve({ projectId, subjectType: 'entity', subjectKey: 'hero', autoReferences: false, editSourceRef });

      expect(resolved.references).toEqual([{ source: 'candidate', ref: editSourceRef, role: 'edit-source', origin: 'auto', reason: 'auto:edit-source' }]);
    });
  });

  describe('capacity and priority', () => {
    it("should trim auto references beyond the default image model's single slot with warnings", async () => {
      const projectId = await seedProject();
      await seedCast(projectId, 2, [
        { key: 'a', imagePath: harness.put(), significance: 'major' },
        { key: 'b', imagePath: harness.put(), significance: 'major' },
        { key: 'c', imagePath: harness.put(), significance: 'minor' },
        { key: 'd', imagePath: harness.put(), significance: 'minor' },
      ]);

      const resolved = await harness.resolve({ projectId, subjectType: 'chapter', subjectKey: '2' });

      expect(resolved.capacity).toBe(1);
      expect(resolved.references.map(reference => reference.sourceId)).toEqual(['a']);
      expect(resolved.warnings.map(warning => [warning.code, warning.sourceId])).toEqual([
        ['capacity-trimmed', 'b'],
        ['capacity-trimmed', 'c'],
      ]);
    });

    it('should trim against a higher stubbed capacity', async () => {
      const projectId = await seedProject();
      harness.setCapacity(2);
      await seedCast(projectId, 2, [
        { key: 'a', imagePath: harness.put(), significance: 'major' },
        { key: 'b', imagePath: harness.put(), significance: 'major' },
        { key: 'c', imagePath: harness.put(), significance: 'major' },
      ]);

      const resolved = await harness.resolve({ projectId, subjectType: 'chapter', subjectKey: '2' });

      expect(resolved.references.map(reference => reference.sourceId)).toEqual(['a', 'b']);
      expect(resolved.warnings).toMatchObject([{ code: 'capacity-trimmed', source: 'portrait', sourceId: 'c' }]);
    });

    it('should refuse attached references beyond capacity, counting the edit source', async () => {
      const projectId = await seedProject(harness.put());
      await seedEntity(projectId, { key: 'hero', imagePath: harness.put() });

      await expect(harness.resolve({ projectId, attached: [attach('cover'), attach('portrait', 'hero')] })).rejects.toMatchObject({
        code: 'ILL_011',
        data: { capacity: 1, count: 2 },
      });
      await expect(harness.resolve({ projectId, attached: [attach('cover')], editSourceRef: harness.put() })).rejects.toMatchObject({ code: 'ILL_011' });
    });

    it('should order edit source, then attached in request order, then auto, and trim auto first', async () => {
      const editSourceRef = harness.put('edit');
      const coverRef = harness.put('cover');
      const projectId = await seedProject(coverRef);
      const galleryRef = harness.put('gallery');
      const galleryId = await seedGallery(projectId, galleryRef);
      await seedEntity(projectId, { key: 'hero', imagePath: harness.put('portrait') });
      harness.setCapacity(3);

      const resolved = await harness.resolve({ projectId, subjectType: 'entity', subjectKey: 'hero', editSourceRef, attached: [attach('gallery', galleryId), attach('cover')] });

      expect(resolved.references.map(reference => [reference.role, reference.origin, reference.ref])).toEqual([
        ['edit-source', 'auto', editSourceRef],
        ['style', 'attached', galleryRef],
        ['style', 'attached', coverRef],
      ]);
      expect(resolved.dataUrls).toEqual([dataUrl('edit'), dataUrl('gallery'), dataUrl('cover')]);
      expect(resolved.warnings).toMatchObject([{ code: 'capacity-trimmed', source: 'portrait', sourceId: 'hero' }]);
    });

    it('should dedupe by storage ref, keeping the highest-priority entry', async () => {
      const portraitRef = harness.put();
      const projectId = await seedProject();
      await seedEntity(projectId, { key: 'hero', imagePath: portraitRef });
      const galleryId = await seedGallery(projectId, portraitRef);

      const attachedOverAuto = await harness.resolve({
        projectId,
        subjectType: 'entity',
        subjectKey: 'hero',
        attached: [attach('portrait', 'hero', 'likeness'), attach('gallery', galleryId)],
      });
      expect(attachedOverAuto.references).toMatchObject([{ source: 'portrait', origin: 'attached' }]);
      expect(attachedOverAuto.warnings).toEqual([]);

      const editOverAttached = await harness.resolve({ projectId, editSourceRef: portraitRef, attached: [attach('gallery', galleryId)] });
      expect(editOverAttached.references).toMatchObject([{ role: 'edit-source', ref: portraitRef }]);
    });
  });

  describe('bytes', () => {
    const oversized = new Uint8Array(MAX_REFERENCE_BYTES + 1);

    it('should drop missing, oversized and unsupported auto references with warnings and backfill the slot', async () => {
      const projectId = await seedProject();
      const keptRef = harness.put('kept');
      await seedCast(projectId, 7, [
        { key: 'missing', imagePath: 'ref-never-stored.png', significance: 'major' },
        { key: 'huge', imagePath: harness.put(oversized), significance: 'major' },
        { key: 'gif', imagePath: harness.put('gif', 'image/gif'), significance: 'major' },
        { key: 'kept', imagePath: keptRef, significance: 'minor' },
      ]);

      const resolved = await harness.resolve({ projectId, subjectType: 'chapter', subjectKey: '7' });

      expect(resolved.references.map(reference => reference.ref)).toEqual([keptRef]);
      expect(resolved.warnings.map(warning => [warning.code, warning.sourceId])).toEqual([
        ['missing-file', 'missing'],
        ['too-large', 'huge'],
        ['unsupported-format', 'gif'],
      ]);
    });

    it('should drop an auto reference that would overflow the request budget', async () => {
      const projectId = await seedProject();
      harness.setCapacity(3);
      const nearLimit = new Uint8Array(MAX_REFERENCE_BYTES);
      await seedCast(projectId, 1, [
        { key: 'a', imagePath: harness.put(nearLimit), significance: 'major' },
        { key: 'b', imagePath: harness.put(nearLimit.slice(8)), significance: 'major' },
        { key: 'c', imagePath: harness.put(new Uint8Array(9)), significance: 'minor' },
        { key: 'd', imagePath: harness.put('small'), significance: 'minor' },
      ]);

      const resolved = await harness.resolve({ projectId, subjectType: 'chapter', subjectKey: '1' });

      expect(resolved.references.map(reference => reference.sourceId)).toEqual(['a', 'b', 'd']);
      expect(resolved.totalBytes).toBeLessThanOrEqual(MAX_REFERENCE_REQUEST_BYTES);
      expect(resolved.warnings).toMatchObject([{ code: 'too-large', sourceId: 'c' }]);
    });

    it('should refuse an attached reference that is missing, oversized or unsupported', async () => {
      const projectId = await seedProject();
      await seedEntity(projectId, { key: 'missing', imagePath: 'ref-never-stored.png' });
      await seedEntity(projectId, { key: 'huge', imagePath: harness.put(oversized) });
      await seedEntity(projectId, { key: 'gif', imagePath: harness.put('gif', 'image/gif') });

      await expect(harness.resolve({ projectId, attached: [attach('portrait', 'missing')] })).rejects.toMatchObject({ code: 'ILL_010' });
      await expect(harness.resolve({ projectId, attached: [attach('portrait', 'huge')] })).rejects.toMatchObject({ code: 'ILL_012' });
      await expect(harness.resolve({ projectId, attached: [attach('portrait', 'gif')] })).rejects.toMatchObject({ code: 'ILL_014' });
      await expect(harness.resolve({ projectId, editSourceRef: 'ref-never-stored.png' })).rejects.toMatchObject({ code: 'ILL_010' });
    });

    it('should refuse attached references that together exceed the request budget', async () => {
      const projectId = await seedProject();
      harness.setCapacity(3);
      const chunk = new Uint8Array(MAX_REFERENCE_BYTES - 1);
      for (const key of ['a', 'b', 'c']) await seedEntity(projectId, { key, imagePath: harness.put(chunk) });

      await expect(harness.resolve({ projectId, attached: ['a', 'b', 'c'].map(key => attach('portrait', key)) })).rejects.toMatchObject({ code: 'ILL_013' });
    });

    it('should encode data URLs with the normalized content type', async () => {
      const projectId = await seedProject();
      await seedEntity(projectId, { key: 'hero', imagePath: harness.put('jpeg-bytes', 'Image/JPEG; charset=binary') });

      const resolved = await harness.resolve({ projectId, subjectType: 'entity', subjectKey: 'hero' });

      expect(resolved.dataUrls).toEqual([dataUrl('jpeg-bytes', 'image/jpeg')]);
      expect(resolved.totalBytes).toBe('jpeg-bytes'.length);
    });
  });
});
