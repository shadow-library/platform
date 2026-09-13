import { SQL } from 'bun';
import { beforeEach, describe, expect, it } from 'bun:test';

import { GenerationService } from '@modules/generation/generation.service';
import { RefineService } from '@modules/refinement/refine.service';
import { type PrimaryDatabase, type Project, schema } from '@server/database';
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

const testEnv = new TestEnvironment('authoring_guards');

async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: { code?: string }) => e,
  );
  if (!error) throw new Error('expected the call to be rejected');
  return error.code ?? 'NO_CODE';
}

describe.if(pgAvailable)('authoring-pipeline guards', () => {
  testEnv.init();

  let db: PrimaryDatabase;
  let translationId: bigint;
  let curatedId: bigint;
  let authoringId: bigint;

  async function seedProject(name: string, kind: Project.Kind, originalLanguage?: string): Promise<bigint> {
    const [project] = await db.insert(schema.projects).values({ name, kind, originalLanguage }).returning();
    if (!project) throw new Error(`failed to seed the ${kind} project`);
    return project.id;
  }

  beforeEach(async () => {
    db = testEnv.getPostgresClient();
    translationId = await seedProject('guarded-translation', 'translation', 'zh');
    curatedId = await seedProject('guarded-curated', 'curated');
    authoringId = await seedProject('guarded-authoring', 'new_novel');
  });

  describe('GenerationService', () => {
    it('should reject generation for a translation or curated project', async () => {
      const generation = testEnv.getService(GenerationService);

      expect(await rejectionCode(generation.generate(translationId, {}))).toBe('PRJ_009');
      expect(await rejectionCode(generation.generate(curatedId, {}))).toBe('PRJ_009');
    });

    it('should reject planning and outlining for a translation or curated project', async () => {
      const generation = testEnv.getService(GenerationService);

      expect(await rejectionCode(generation.plan(translationId, { volumeCount: 1, chaptersPerVolume: 10 }))).toBe('PRJ_009');
      expect(await rejectionCode(generation.plan(curatedId, { volumeCount: 1, chaptersPerVolume: 10 }))).toBe('PRJ_009');
      expect(await rejectionCode(generation.outline(curatedId, {}))).toBe('PRJ_009');
      expect(await rejectionCode(generation.outlineArc(curatedId, 'v1-a1', {}))).toBe('PRJ_009');
      expect(await rejectionCode(generation.seedFromBrief(curatedId, { brief: 'a salvager' }))).toBe('PRJ_009');
    });

    it('should let a new_novel project past the guard and fail on its own preconditions', async () => {
      expect(await rejectionCode(testEnv.getService(GenerationService).generate(authoringId, {}))).toBe('PLN_001');
    });
  });

  describe('RefineService', () => {
    it('should reject enhancePremise for a translation or curated project', async () => {
      const refine = testEnv.getService(RefineService);

      expect(await rejectionCode(refine.enhancePremise(translationId, 'a salvager'))).toBe('PRJ_009');
      expect(await rejectionCode(refine.enhancePremise(curatedId, 'a salvager'))).toBe('PRJ_009');
    });

    it('should reject auditBible for a translation or curated project', async () => {
      const refine = testEnv.getService(RefineService);

      expect(await rejectionCode(refine.auditBible(translationId))).toBe('PRJ_009');
      expect(await rejectionCode(refine.auditBible(curatedId))).toBe('PRJ_009');
    });

    it('should reject planArcs for a translation or curated project', async () => {
      const refine = testEnv.getService(RefineService);

      expect(await rejectionCode(refine.planArcs(translationId, 'v1'))).toBe('PRJ_009');
      expect(await rejectionCode(refine.planArcs(curatedId, 'v1'))).toBe('PRJ_009');
    });

    it('should let a new_novel project past the guard and fail on its own preconditions', async () => {
      expect(await rejectionCode(testEnv.getService(RefineService).enhancePremise(authoringId))).toBe('PRM_001');
    });
  });
});
