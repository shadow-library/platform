import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type Ideation, type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_ideation_schema`;

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

async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  const error = await query.then(
    () => null,
    (e: Error) => e,
  );
  if (!error) throw new Error('expected query to be rejected');
  return String(error.cause ?? error.message);
}

describe.if(pgAvailable)('ideation schemas', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `ideation-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should default a project to active status', async () => {
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    expect(project?.status).toBe('active');
  });

  it('should accept the seed project status', async () => {
    const [seed] = await db
      .insert(schema.projects)
      .values({ name: `ideation-seed-${Date.now()}`, kind: 'new_novel', status: 'seed' })
      .returning();
    expect(seed?.status).toBe('seed');
  });

  it('should default the seed sheet columns', async () => {
    const [seed] = await db.insert(schema.storySeeds).values({ projectId }).returning();
    expect(seed).toMatchObject({
      revision: 1,
      contentHash: null,
      fields: null,
      provenance: null,
      constraints: null,
      tasteAnchors: null,
      concepts: null,
      readiness: null,
      askedQuestions: null,
    });
  });

  it('should round-trip the sheet, provenance, constraints, concepts and readiness as jsonb', async () => {
    const fields: Ideation.SeedFields = { premise: 'a salvager finds a dead god', castShape: 'dual leads, bonded', themes: ['debt', 'inheritance'] };
    const provenance: Ideation.SeedProvenance = { premise: { source: 'author', turnOrdinal: 3 }, castShape: { source: 'studio', turnOrdinal: 5 } };
    const constraints: Ideation.SeedConstraint[] = [{ key: 'no-harem', kind: 'promise', text: 'one romance, never a roster', playbookKey: 'no-harem', lockedBy: 'author' }];
    const tasteAnchors: Ideation.TasteAnchors = { comps: ['Cradle'], preferences: ['clear power rules'] };
    const concepts: Ideation.ConceptCard[] = [
      { round: 1, title: 'Salvage Rites', logline: 'he sells what the gods left', engine: 'debt', ladder: 'relic tiers', posture: 'wry', fate: 'kept' },
    ];
    const readiness: Ideation.ReadinessEntry[] = [{ dimension: 'hook', verdict: 'thin', note: 'the promise is implied, never stated', fix: 'name the betrayal' }];

    const [row] = await db
      .insert(schema.storySeeds)
      .values({
        projectId: (
          await db
            .insert(schema.projects)
            .values({ name: `ideation-sheet-${Date.now()}`, kind: 'new_novel', status: 'seed' })
            .returning()
        )[0]!.id,
        fields,
        provenance,
        constraints,
        tasteAnchors,
        concepts,
        readiness,
        askedQuestions: ['orient.shelf', 'deepen.ladder'],
        contentHash: 'abc123',
      })
      .returning();

    expect(row).toMatchObject({ fields, provenance, constraints, tasteAnchors, concepts, readiness, askedQuestions: ['orient.shelf', 'deepen.ladder'], contentHash: 'abc123' });
  });

  it('should allow only one seed per project', async () => {
    const duplicate = db.insert(schema.storySeeds).values({ projectId }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/story_seeds_project_id_unique/);
  });

  it('should cascade the seed away when its project is deleted', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `ideation-cascade-${Date.now()}`, kind: 'new_novel', status: 'seed' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.storySeeds).values({ projectId: project.id });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    expect(await db.select().from(schema.storySeeds).where(eq(schema.storySeeds.projectId, project.id))).toHaveLength(0);
  });

  it('should accept the ideation chat scope and carry a structured message payload', async () => {
    const [session] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'ideation' }).returning();
    if (!session) throw new Error('failed to seed chat session');

    const payload = { questions: [{ id: 'orient.shelf', wording: 'which shelf?', options: ['progression', 'romantasy'] }] };
    const [message] = await db
      .insert(schema.chatMessages)
      .values({ sessionId: session.id, projectId, ordinal: 1, role: 'assistant', content: 'which shelf?', payload })
      .returning();

    expect(session.scopeType).toBe('ideation');
    expect(message).toMatchObject({ payload });
  });

  it('should accept the ideation proposal kind', async () => {
    const [proposal] = await db.insert(schema.refinementProposals).values({ projectId, scopeType: 'ideation', kind: 'ideation', changeSet: [], baseline: {} }).returning();
    expect(proposal).toMatchObject({ kind: 'ideation', scopeType: 'ideation', status: 'pending' });
  });

  it('should accept seed as a canon-fact knowledge source', async () => {
    const [fact] = await db
      .insert(schema.canonFacts)
      .values({ projectId, factKey: `promise:no-harem-${Date.now()}`, text: 'one romance, never a roster' })
      .returning();
    const [entity] = await db
      .insert(schema.entities)
      .values({ projectId, entityKey: `lead-${Date.now()}`, type: 'character', name: 'Ren' })
      .returning();
    if (!fact || !entity) throw new Error('failed to seed knowledge fixtures');

    const [ledgered] = await db.insert(schema.characterKnowledge).values({ projectId, factId: fact.id, entityId: entity.id, learnedInChapter: 1, source: 'seed' }).returning();
    expect(ledgered?.source).toBe('seed');
  });
});
