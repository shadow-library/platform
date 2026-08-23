import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { GenerationService } from '@modules/generation/generation.service';
import { type Generation, type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_draft_mutation_guards`;

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

describe.if(pgAvailable)('GenerationService draft mutation guards', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const noop = {} as never;
    const modelRouter = { structured: async () => ({ title: 'revised title', body: 'revised body', summary: 'revised summary', state: {} }) } as never;
    const contextAssembler = { forChapter: async () => ({ rendered: '' }) } as never;
    service = new GenerationService({ getPostgresClient: () => db } as never, noop, modelRouter, contextAssembler, noop, noop, noop, noop, noop, noop, noop, noop);
  });

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `guard-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  interface SeedDraftOptions {
    reviewStatus?: Generation.DraftReviewStatus;
    staleReason?: string | null;
  }

  async function seedDraft(projectId: bigint, chapter: number, status: 'draft' | 'final', options: SeedDraftOptions = {}): Promise<void> {
    await db.insert(schema.drafts).values({
      projectId,
      chapter,
      title: 'original title',
      body: 'original body',
      summary: 'original summary',
      status,
      reviewStatus: options.reviewStatus ?? 'needs_review',
      staleReason: options.staleReason ?? null,
    });
  }

  const draftAt = (projectId: bigint, chapter: number) => db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });

  describe('updateDraft', () => {
    it('should reject a finalized draft and leave its prose untouched', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'final');

      expect(await codeOf(service.updateDraft(projectId, 1, { body: 'overwritten' }))).toBe('DRF_002');

      const draft = await draftAt(projectId, 1);
      expect(draft?.body).toBe('original body');
      expect(draft?.status).toBe('final');
      expect(draft?.revision).toBe(0);
    });

    it('should update a draft that is not finalized', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');

      const updated = await service.updateDraft(projectId, 1, { body: 'edited body', title: 'edited title' });

      expect(updated.body).toBe('edited body');
      expect(updated.title).toBe('edited title');
      expect(updated.reviewStatus).toBe('needs_review');
    });

    it('should create a draft when none exists at that chapter', async () => {
      const projectId = await seedProject();

      const created = await service.updateDraft(projectId, 4, { body: 'brand new' });

      expect(created.chapter).toBe(4);
      expect(created.body).toBe('brand new');
      expect(created.generator).toBe('human');
    });
  });

  describe('importDraft', () => {
    it('should reject a finalized draft and leave its prose untouched', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'final');

      expect(await codeOf(service.importDraft(projectId, 1, { prose: 'imported over a locked chapter' }))).toBe('DRF_002');

      const draft = await draftAt(projectId, 1);
      expect(draft?.body).toBe('original body');
      expect(draft?.status).toBe('final');
    });

    it('should import over a draft that is not finalized', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');

      const imported = await service.importDraft(projectId, 1, { prose: 'imported body', title: 'imported title' });

      expect(imported.body).toBe('imported body');
      expect(imported.title).toBe('imported title');
    });

    it('should import into an empty chapter slot', async () => {
      const projectId = await seedProject();

      const imported = await service.importDraft(projectId, 2, { prose: 'fresh import' });

      expect(imported.chapter).toBe(2);
      expect(imported.body).toBe('fresh import');
    });
  });

  describe('descendant invalidation', () => {
    it('should mark a descendant stale and revoke its approval when updateDraft edits an ancestor', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');
      await seedDraft(projectId, 2, 'draft', { reviewStatus: 'approved' });

      await service.updateDraft(projectId, 1, { body: 'edited ancestor' });

      const descendant = await draftAt(projectId, 2);
      expect(descendant?.staleReason).toBeTruthy();
      expect(descendant?.reviewStatus).toBe('needs_review');
    });

    it('should mark a descendant stale and revoke its approval when importDraft replaces an ancestor', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');
      await seedDraft(projectId, 2, 'draft', { reviewStatus: 'approved' });

      await service.importDraft(projectId, 1, { prose: 'imported ancestor' });

      const descendant = await draftAt(projectId, 2);
      expect(descendant?.staleReason).toBeTruthy();
      expect(descendant?.reviewStatus).toBe('needs_review');
    });

    it('should mark a descendant stale and revoke its approval when reviseDraft rewrites an ancestor', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');
      await seedDraft(projectId, 2, 'draft', { reviewStatus: 'approved' });

      await service.reviseDraft(projectId, 1, { note: 'tighten the opening' });

      const descendant = await draftAt(projectId, 2);
      expect(descendant?.staleReason).toBeTruthy();
      expect(descendant?.reviewStatus).toBe('needs_review');
    });

    it('should reject approving a stale draft', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft', { staleReason: 'ancestor chapter 0 was hand_edited' });

      expect(await codeOf(service.approveDraft(projectId, 1))).toBe('DRF_007');
    });

    it('should leave ancestors and other projects untouched', async () => {
      const projectId = await seedProject();
      const otherProjectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');
      await seedDraft(projectId, 2, 'draft');
      await seedDraft(projectId, 3, 'draft');
      await seedDraft(otherProjectId, 5, 'draft');

      await service.updateDraft(projectId, 3, { body: 'edited chapter three' });

      expect((await draftAt(projectId, 1))?.staleReason).toBeNull();
      expect((await draftAt(projectId, 2))?.staleReason).toBeNull();
      expect((await draftAt(otherProjectId, 5))?.staleReason).toBeNull();
    });

    it('should not change a descendant review status that is not approved', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');
      await seedDraft(projectId, 2, 'draft', { reviewStatus: 'contradiction' });

      await service.updateDraft(projectId, 1, { body: 'edited ancestor' });

      const descendant = await draftAt(projectId, 2);
      expect(descendant?.staleReason).toBeTruthy();
      expect(descendant?.reviewStatus).toBe('contradiction');
    });

    it('should never mark a finalized descendant stale', async () => {
      const projectId = await seedProject();
      await seedDraft(projectId, 1, 'draft');
      await seedDraft(projectId, 2, 'final', { reviewStatus: 'final' });

      await service.updateDraft(projectId, 1, { body: 'edited ancestor' });

      const descendant = await draftAt(projectId, 2);
      expect(descendant?.staleReason).toBeNull();
      expect(descendant?.status).toBe('final');
      expect(descendant?.reviewStatus).toBe('final');
    });
  });
});
