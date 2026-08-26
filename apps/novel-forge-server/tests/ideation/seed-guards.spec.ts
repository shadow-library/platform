import { SQL } from 'bun';
import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { eq } from 'drizzle-orm';
import { ContextService } from '@shadow-library/fastify';

import { GenerationService } from '@modules/generation/generation.service';
import { ProjectService } from '@modules/project/project/project.service';
import { PublishingService } from '@modules/publishing/publishing.service';
import { RefineService } from '@modules/refinement/refine.service';
import { type PrimaryDatabase, schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const testEnv = new TestEnvironment('seed_guards');

async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: { code?: string }) => e,
  );
  if (!error) throw new Error('expected the call to be rejected');
  return error.code ?? 'NO_CODE';
}

describe.if(pgAvailable)('seed-status guards', () => {
  testEnv.init();

  let db: PrimaryDatabase;
  let seedId: bigint;
  let activeId: bigint;

  beforeEach(async () => {
    db = testEnv.getPostgresClient();
    const [seed] = await db.insert(schema.projects).values({ name: 'guarded-seed', kind: 'new_novel', status: 'seed' }).returning();
    const [active] = await db.insert(schema.projects).values({ name: 'guarded-active', kind: 'new_novel' }).returning();
    if (!seed || !active) throw new Error('failed to seed projects');
    seedId = seed.id;
    activeId = active.id;
  });

  describe('GenerationService', () => {
    it('should reject seedFromBrief for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).seedFromBrief(seedId, { brief: 'a salvager' }))).toBe('IDE_004');
    });

    it('should reject plan for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).plan(seedId, { volumeCount: 1, chaptersPerVolume: 10 }))).toBe('IDE_004');
    });

    it('should reject outline for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).outline(seedId, {}))).toBe('IDE_004');
    });

    it('should reject arc outlining for a seed project before the arc is looked up', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).outlineArc(seedId, 'v1-a1', {}))).toBe('IDE_004');
    });

    it('should reject generate for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).generate(seedId, {}))).toBe('IDE_004');
    });

    it('should let an active project past the guard and fail on its own preconditions', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).generate(activeId, {}))).toBe('PLN_001');
    });

    it('should report a missing project rather than a seed', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).generate(999_999n, {}))).toBe('PRJ_001');
    });
  });

  describe('RefineService', () => {
    it('should reject enhancePremise for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(RefineService).enhancePremise(seedId, 'a salvager'))).toBe('IDE_004');
    });

    it('should reject planArcs for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(RefineService).planArcs(seedId, 'v1'))).toBe('IDE_004');
    });

    it('should let an active project past the guard and fail on its own preconditions', async () => {
      expect(await rejectionCode(testEnv.getService(RefineService).enhancePremise(activeId))).toBe('PRM_001');
    });
  });

  describe('PublishingService', () => {
    it('should reject publishNovel for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(PublishingService).publishNovel(seedId, { title: 'Salvage Rites' }))).toBe('IDE_004');
    });

    it('should reject publishChapter for a seed project', async () => {
      expect(await rejectionCode(testEnv.getService(PublishingService).publishChapter(seedId, 1, {}))).toBe('IDE_004');
    });

    it('should let an active project past the guard and fail on its own preconditions', async () => {
      expect(await rejectionCode(testEnv.getService(PublishingService).publishChapter(activeId, 1, {}))).toBe('PUB_001');
    });
  });

  describe('ProjectService.create', () => {
    afterAll(() => mock.restore());

    // `create` reads the owner from the request-scoped principal, which no service-level call has.
    function projectServiceAsOwner(): ProjectService {
      spyOn(testEnv.getService(ContextService), 'getAuthPrincipal').mockReturnValue({ sub: '1' } as never);
      return testEnv.getService(ProjectService);
    }

    it('should default a new project to active and pre-seed the blank bible documents', async () => {
      const project = await projectServiceAsOwner().create({ name: 'active-novel', kind: 'new_novel' });

      expect(project.status).toBe('active');
      expect(await db.select().from(schema.bibleDocuments).where(eq(schema.bibleDocuments.projectId, project.id))).toHaveLength(7);
    });

    it('should create a seed without any blank bible documents', async () => {
      const project = await projectServiceAsOwner().create({ name: 'seed-novel', kind: 'new_novel' }, { status: 'seed' });

      expect(project.status).toBe('seed');
      expect(await db.select().from(schema.bibleDocuments).where(eq(schema.bibleDocuments.projectId, project.id))).toHaveLength(0);
    });
  });
});
