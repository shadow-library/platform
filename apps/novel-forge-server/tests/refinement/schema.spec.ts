/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_refinement_schema`;

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

// Drizzle wraps constraint violations in a "Failed query" error; the violated constraint's name only
// appears on the underlying driver error in `cause`.
async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  const error = await query.then(
    () => null,
    (e: Error) => e,
  );
  if (!error) throw new Error('expected query to be rejected');
  return String(error.cause ?? error.message);
}

describe.if(pgAvailable)('refinement & arc schemas', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `refinement-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should default volume and brief versioning columns', async () => {
    const [volume] = await db.insert(schema.volumes).values({ projectId, volumeKey: 'vol_1', targetChapterCount: 12 }).returning();
    expect(volume).toMatchObject({ revision: 1, contentHash: null, staleReason: null, targetChapterCount: 12 });

    const [brief] = await db.insert(schema.briefs).values({ projectId, chapter: 1, volumeKey: 'vol_1', arcKey: 'vol_1_arc_1', body: 'brief body' }).returning();
    expect(brief).toMatchObject({ revision: 1, arcKey: 'vol_1_arc_1', endingContract: null, staleReason: null });
  });

  it('should insert an arc and enforce the chapter range check', async () => {
    const [arc] = await db
      .insert(schema.arcs)
      .values({ projectId, arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', ordinal: 1, title: 'The Trial', chapterStart: 1, chapterEnd: 6, hook: 'the gates open' })
      .returning();
    expect(arc).toMatchObject({ status: 'draft', revision: 1, chapterStart: 1, chapterEnd: 6 });

    const invalidRange = db.insert(schema.arcs).values({ projectId, arcKey: 'vol_1_arc_bad', volumeKey: 'vol_1', chapterStart: 9, chapterEnd: 3 }).execute();
    expect(await violatedConstraint(invalidRange)).toMatch(/arcs_chapter_range_check/);
  });

  it('should reject duplicate arc keys within a project', async () => {
    const duplicate = db.insert(schema.arcs).values({ projectId, arcKey: 'vol_1_arc_1', volumeKey: 'vol_1' }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/arcs_project_id_arc_key_unique/);
  });

  it('should round-trip a chat session, its messages, and a proposal', async () => {
    const [session] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'volume', scopeRef: 'volume:vol_1', title: 'refine vol 1' }).returning();
    if (!session) throw new Error('failed to insert session');
    expect(session).toMatchObject({ status: 'active', summaryThroughOrdinal: 0 });

    const [proposal] = await db
      .insert(schema.refinementProposals)
      .values({
        projectId,
        sessionId: session.id,
        scopeType: 'volume',
        scopeRef: 'volume:vol_1',
        kind: 'chat',
        changeSet: [{ op: 'volume.upsert', volumeKey: 'vol_1', objective: 'sharper stakes' }],
        baseline: { 'volume:vol_1': { revision: 1, contentHash: null } },
      })
      .returning();
    if (!proposal) throw new Error('failed to insert proposal');
    expect(proposal).toMatchObject({ status: 'pending', kind: 'chat' });

    await db.insert(schema.chatMessages).values({ sessionId: session.id, projectId, ordinal: 1, role: 'user', content: 'raise the stakes' });
    const [assistant] = await db
      .insert(schema.chatMessages)
      .values({ sessionId: session.id, projectId, ordinal: 2, role: 'assistant', content: 'proposed sharper stakes', proposalId: proposal.id })
      .returning();
    expect(assistant?.proposalId).toBe(proposal.id);

    const duplicateOrdinal = db.insert(schema.chatMessages).values({ sessionId: session.id, projectId, ordinal: 2, role: 'user', content: 'again' }).execute();
    expect(await violatedConstraint(duplicateOrdinal)).toMatch(/chat_messages_session_id_ordinal_unique/);
  });

  it('should cascade messages and null proposal sessions when a session is deleted', async () => {
    const [session] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'novel' }).returning();
    if (!session) throw new Error('failed to insert session');
    await db.insert(schema.chatMessages).values({ sessionId: session.id, projectId, ordinal: 1, role: 'user', content: 'hello' });
    const [proposal] = await db
      .insert(schema.refinementProposals)
      .values({ projectId, sessionId: session.id, scopeType: 'novel', kind: 'chat', changeSet: [], baseline: {} })
      .returning();
    if (!proposal) throw new Error('failed to insert proposal');

    await db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, session.id));

    const messages = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.sessionId, session.id));
    expect(messages).toHaveLength(0);
    const [orphaned] = await db.select().from(schema.refinementProposals).where(eq(schema.refinementProposals.id, proposal.id));
    expect(orphaned?.sessionId).toBeNull();
  });

  it('should accept the refinement_proposal feedback artifact type', async () => {
    const [feedback] = await db.insert(schema.userFeedback).values({ projectId, artifactType: 'refinement_proposal', artifactRef: '1', disposition: 'approved' }).returning();
    expect(feedback?.artifactType).toBe('refinement_proposal');
  });
});
