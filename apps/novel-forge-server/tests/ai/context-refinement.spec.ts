import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ARC_PLAN_BUDGET, CHAT_PACK_BUDGET, ContextAssembler, PREMISE_BUDGET } from '@modules/ai/context/context-assembler.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_context_refinement`;

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

describe.if(pgAvailable)('ContextAssembler refinement purposes', () => {
  let db: PrimaryDatabase;
  let assembler: ContextAssembler;
  let projectId: bigint;
  const sessionStart = new Date();

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `ctx-refine-${Date.now()}`, kind: 'new_novel', premise: 'a cultivator returns from death to burn the sect that betrayed him', themes: ['revenge'] })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;

    await db.insert(schema.bibleDocuments).values([
      { projectId, section: 'project', slug: 'reader-promise', body: 'Weekly power-ups.\nEvery arc ends with a rank breakthrough.' },
      { projectId, section: 'power', slug: 'progression-ladder', body: 'Nine mortal ranks, then ascension.' },
    ]);
    await db.insert(schema.volumes).values([
      {
        projectId,
        volumeKey: 'v1',
        ordinal: 1,
        title: 'The Trial',
        objective: 'survive the sect trials',
        conflict: 'rival heir',
        payoff: 'first breakthrough',
        status: 'approved',
        targetChapterCount: 10,
        startChapter: 1,
        endChapter: 10,
        epitome: 'He survived and made an enemy.',
      },
      { projectId, volumeKey: 'v2', ordinal: 2, title: 'The War', objective: 'win the border war', status: 'approved', targetChapterCount: 10, startChapter: 11, endChapter: 20 },
    ]);
    await db.insert(schema.arcs).values([
      {
        projectId,
        arcKey: 'v1_a1',
        volumeKey: 'v1',
        ordinal: 1,
        title: 'Entry',
        objective: 'enter the trials',
        escalation: 'sabotage',
        payoff: 'first blood',
        hook: 'the rival smiles from the shadows',
        chapterStart: 1,
        chapterEnd: 5,
        status: 'approved',
      },
      {
        projectId,
        arcKey: 'v1_a2',
        volumeKey: 'v1',
        ordinal: 2,
        title: 'Depths',
        objective: 'survive the depths',
        escalation: 'betrayal',
        payoff: 'breakthrough',
        hook: 'war horns at the border',
        chapterStart: 6,
        chapterEnd: 10,
        status: 'approved',
      },
    ]);
    await db.insert(schema.briefs).values({
      projectId,
      chapter: 3,
      volumeKey: 'v1',
      arcKey: 'v1_a1',
      title: 'The First Cut',
      body: 'He faces the rival in the opening duel.',
      contextRefs: ['volume:v1'],
      endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'who poisoned the blade?', handoffState: 'bleeding in the arena dark' },
    });
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('keeps the chat stable segment byte-identical across assemblies with unchanged canon', async () => {
    const session = { scopeType: 'volume' as const, scopeRef: 'volume:v1', createdAt: sessionStart };
    const first = await assembler.forChatTurn(projectId, session);
    const second = await assembler.forChatTurn(projectId, session);

    expect(first.renderedStable.length).toBeGreaterThan(0);
    expect(second.renderedStable).toBe(first.renderedStable);
    expect(first.purpose).toBe('chat');
    expect(first.budgetTokens).toBe(CHAT_PACK_BUDGET);
    expect(first.rendered.startsWith(first.renderedStable)).toBe(true);
    expect(first.renderedStable).toContain('The Trial');
    expect(first.renderedStable).toContain('v1_a1');
  });

  it('reports canon changed since session start in the volatile tail only', async () => {
    const session = { scopeType: 'volume' as const, scopeRef: 'volume:v1', createdAt: sessionStart };
    const before = await assembler.forChatTurn(projectId, session);
    expect(before.renderedVolatile).not.toContain('changed');

    await db
      .update(schema.volumes)
      .set({ objective: 'survive AND humiliate the rival', revision: 2, updatedAt: new Date() })
      .where(and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, 'v1')));

    const after = await assembler.forChatTurn(projectId, session);
    expect(after.renderedVolatile).toContain('volume:v1 is now at revision 2');
    expect(after.renderedStable).toContain('humiliate the rival');
  });

  it('builds brief-scoped packs with the arc, volume objective, and resolved refs', async () => {
    const pack = await assembler.forChatTurn(projectId, { scopeType: 'brief', scopeRef: 'chapter:3', createdAt: new Date() });
    expect(pack.renderedStable).toContain('The First Cut');
    expect(pack.renderedStable).toContain('who poisoned the blade?');
    expect(pack.renderedStable).toContain('v1_a1');
    expect(pack.sections.every(s => s.key === 'changed_since' || s.segment === 'stable')).toBe(true);
  });

  it('builds arc-planning packs with the previous volume handoff and next volume objective', async () => {
    const pack = await assembler.forArcPlanning(projectId, 'v2');
    expect(pack.purpose).toBe('arc_plan');
    expect(pack.budgetTokens).toBe(ARC_PLAN_BUDGET);
    expect(pack.rendered).toContain('war horns at the border');
    expect(pack.rendered).toContain('a cultivator returns from death');
  });

  it('builds premise and audit packs with graded document inventories', async () => {
    const premisePack = await assembler.forPremise(projectId);
    expect(premisePack.purpose).toBe('premise');
    expect(premisePack.budgetTokens).toBe(PREMISE_BUDGET);
    expect(premisePack.rendered).toContain('project/reader-promise');
    expect(premisePack.rendered).not.toContain('Every arc ends with a rank breakthrough.');

    const auditPack = await assembler.forAudit(projectId);
    expect(auditPack.purpose).toBe('audit');
    expect(auditPack.rendered).toContain('Every arc ends with a rank breakthrough.');
  });
});
