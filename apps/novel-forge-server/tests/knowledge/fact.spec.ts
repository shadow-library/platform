/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';
import { TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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

const testEnv = new TestEnvironment('fact_api');

describe.if(pgAvailable)('Canon Fact API', () => {
  testEnv.init();

  async function createProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `fact-api-${Math.random()}`, kind: 'new_novel' });
    return response.json().id as string;
  }

  async function createEntity(projectId: string, entityKey: string, name: string): Promise<void> {
    const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/entities`).body({ entityKey, type: 'character', name });
    expect(response.statusCode).toBe(201);
  }

  async function putFact(projectId: string, factKey: string, body: Record<string, unknown>): Promise<Record<string, never>> {
    const response = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/facts/${factKey}`).body(body);
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  describe('PUT /api/v1/projects/:projectId/facts/:factKey', () => {
    it('should create a fact, round-trip its fields, and merge omitted fields on re-put', async () => {
      const projectId = await createProject();
      const created = await putFact(projectId, 'ledger_forgery', {
        text: 'The ledger is a forgery planted by Elias.',
        subjects: ['elias'],
        constraintNote: 'Elias steers conversation away from the study.',
        terms: ['forgery'],
        revealChapter: 9,
      });
      expect(created).toMatchObject({
        factKey: 'ledger_forgery',
        text: 'The ledger is a forgery planted by Elias.',
        subjects: ['elias'],
        terms: ['forgery'],
        revealChapter: 9,
        knowledge: [],
      });

      const updated = await putFact(projectId, 'ledger_forgery', { text: 'The ledger is a forgery planted by Elias himself.' });
      expect(updated).toMatchObject({ text: 'The ledger is a forgery planted by Elias himself.', subjects: ['elias'], terms: ['forgery'], revealChapter: 9 });

      const list = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/facts`);
      expect(list.statusCode).toBe(200);
      expect(list.json().facts).toHaveLength(1);
    });
  });

  describe('POST /api/v1/projects/:projectId/facts/:factKey/reveal', () => {
    it('should ledger a reveal, correct it idempotently, and retract it', async () => {
      const projectId = await createProject();
      await createEntity(projectId, 'amara', 'Detective Amara');
      await putFact(projectId, 'service_door', { text: 'The killer used the service door.' });

      const revealed = await testEnv
        .getRouter()
        .mockRequest()
        .post(`/api/v1/projects/${projectId}/facts/service_door/reveal`)
        .body({ entityKey: 'amara', chapter: 4, note: 'saw the scratches' });
      expect(revealed.statusCode).toBe(200);
      expect(revealed.json().knowledge).toEqual([
        expect.objectContaining({ entityKey: 'amara', entityName: 'Detective Amara', learnedInChapter: 4, source: 'manual', note: 'saw the scratches' }),
      ]);

      const corrected = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/facts/service_door/reveal`).body({ entityKey: 'amara', chapter: 6 });
      expect(corrected.json().knowledge).toEqual([expect.objectContaining({ entityKey: 'amara', learnedInChapter: 6 })]);

      const retracted = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/facts/service_door/knowledge/amara`);
      expect(retracted.statusCode).toBe(200);
      expect(retracted.json().knowledge).toEqual([]);
    });

    it('should reject unknown fact and entity keys with FCT codes', async () => {
      const projectId = await createProject();
      await putFact(projectId, 'motive_debt', { text: 'Marlow owed Elias a ruinous debt.' });

      const missingFact = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/facts/nope/reveal`).body({ entityKey: 'amara', chapter: 1 });
      expect(missingFact.statusCode).toBe(404);
      expect(missingFact.json().code).toBe('FCT_001');

      const missingEntity = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/facts/motive_debt/reveal`).body({ entityKey: 'ghost', chapter: 1 });
      expect(missingEntity.statusCode).toBe(400);
      expect(missingEntity.json().code).toBe('FCT_002');
    });
  });

  describe('DELETE /api/v1/projects/:projectId/facts/:factKey', () => {
    it('should delete the fact and cascade its ledger, then 404 on re-read', async () => {
      const projectId = await createProject();
      await createEntity(projectId, 'boone', 'Sergeant Boone');
      await putFact(projectId, 'motive_debt', { text: 'Marlow owed Elias a ruinous debt.' });
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/facts/motive_debt/reveal`).body({ entityKey: 'boone', chapter: 2 });

      const deleted = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/facts/motive_debt`);
      expect(deleted.statusCode).toBe(204);

      const read = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/facts/motive_debt`);
      expect(read.statusCode).toBe(404);
      expect(read.json().code).toBe('FCT_001');
    });
  });

  describe('draft approval reveal gate', () => {
    it('should ledger the brief learns on approve and skip unknown keys without failing', async () => {
      const projectId = await createProject();
      await createEntity(projectId, 'amara', 'Detective Amara');
      await putFact(projectId, 'ledger_forgery', { text: 'The ledger is a forgery.' });

      const briefUpdate = await testEnv
        .getRouter()
        .mockRequest()
        .put(`/api/v1/projects/${projectId}/briefs/5`)
        .body({
          body: 'Amara studies the ledger and sees the forged strokes.',
          knowledgeContract: {
            pov: ['amara'],
            learns: [
              { entityKey: 'amara', factKey: 'ledger_forgery' },
              { entityKey: 'ghost', factKey: 'ledger_forgery' },
              { entityKey: 'amara', factKey: 'unknown_fact' },
            ],
          },
        });
      expect(briefUpdate.statusCode).toBe(200);

      const db = testEnv.getPostgresClient();
      const pid = BigInt(projectId);
      const brief = await db.query.briefs.findFirst({ where: eq(schema.briefs.projectId, pid) });
      expect(brief?.knowledgeContract).toMatchObject({ pov: ['amara'] });
      await db.insert(schema.drafts).values({ projectId: pid, chapter: 5, body: 'Chapter prose.', reviewStatus: 'needs_review' });

      const approved = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/drafts/5/approve`).body({});
      expect(approved.statusCode).toBe(200);

      const fact = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/facts/ledger_forgery`);
      expect(fact.json().knowledge).toEqual([expect.objectContaining({ entityKey: 'amara', learnedInChapter: 5, source: 'brief' })]);

      // Re-approval attempts are rejected upstream; a direct re-application must stay idempotent.
      const reapproved = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/drafts/5/approve`).body({});
      expect([200, 400]).toContain(reapproved.statusCode);
      const after = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/facts/ledger_forgery`);
      expect(after.json().knowledge).toHaveLength(1);
    });
  });
});
