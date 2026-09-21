import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ActionExecutorRegistry, ProposalApplyService, ProposalService } from '@modules/refinement';
import { BibleTidyService } from '@modules/refinement/tidy/bible-tidy.service';
import { computeBibleDocHash } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_bible_tidy`;

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

const SECTIONS = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'] as const;

const FACTIONS = [
  '# Powers of the Delta',
  '',
  'Four blocs split the river trade.',
  '',
  '## The Salt Guild',
  '',
  'Merchants who own the evaporation pans.',
  '',
  '## Lantern Order',
  '',
  'Monks who keep the channel lights.',
  '',
  '## House Varenne',
  '',
  'A river dynasty holding the upper locks.',
  '',
  '## The Reed Compact',
  '',
  'Fishing villages sworn against the Guild.',
].join('\n');

const WITH_NOTE = 'The canal city floods every spring.\n\nSchema note: the brief fields must set knowledgeContract whenever the flood cause is learned.\n\nBargemen never swim.';

describe.if(pgAvailable)('BibleTidyService', () => {
  let db: PrimaryDatabase;
  let tidy: BibleTidyService;
  let applier: ProposalApplyService;
  let projectId: bigint;

  const databaseService = () => ({ getPostgresClient: () => db }) as never;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const proposals = new ProposalService(databaseService());
    applier = new ProposalApplyService(databaseService(), new ActionExecutorRegistry());
    tidy = new BibleTidyService(databaseService(), proposals, applier);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `tidy-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;

    await db.insert(schema.bibleDocuments).values(SECTIONS.map(section => ({ projectId, section, slug: 'default' })));
    const authored = [
      { section: 'world' as const, slug: 'lock-tolls', frontmatter: { title: 'lock-tolls' }, body: '# Barge Tolls\n\nTolls rise at every lock.' },
      { section: 'world' as const, slug: 'delta-powers', frontmatter: { title: 'Powers of the Delta' }, body: FACTIONS },
      { section: 'world' as const, slug: 'canal-city', frontmatter: { title: 'Canal City' }, body: WITH_NOTE },
    ];
    await db.insert(schema.bibleDocuments).values(authored.map(doc => ({ projectId, ...doc, contentHash: computeBibleDocHash(doc.frontmatter, doc.body), revision: 1 })));
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function snapshot(): Promise<{ docs: string[]; entities: string[] }> {
    const docs = await db.query.bibleDocuments.findMany({
      where: eq(schema.bibleDocuments.projectId, projectId),
      orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug],
    });
    const entities = await db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), orderBy: [schema.entities.entityKey] });
    return {
      docs: docs.map(doc => `${doc.section}/${doc.slug}|${JSON.stringify(doc.frontmatter)}|${doc.body ?? ''}`),
      entities: entities.map(entity => `${entity.entityKey}|${entity.type}|${entity.name}`),
    };
  }

  it('should list every change the fixture needs', async () => {
    const items = await tidy.preview(projectId);
    const summary = items.map(item => `${item.kind}:${item.section}/${item.slug}`);
    expect(summary).toEqual([
      'remove_empty:project/default',
      'move_ai_notes:world/canal-city',
      'remove_empty:world/default',
      'split:world/delta-powers',
      'split:world/delta-powers',
      'split:world/delta-powers',
      'split:world/delta-powers',
      'retitle:world/lock-tolls',
      'remove_empty:power/default',
      'remove_empty:plot/default',
      'remove_empty:ai/default',
      'remove_empty:lore/default',
    ]);
  });

  it('should apply only the selected items as one revertible proposal, and revert to the exact original', async () => {
    const before = await snapshot();
    const items = await tidy.preview(projectId);
    const pick = (kind: string, n = 0) => items.filter(item => item.kind === kind)[n] as (typeof items)[number];
    const selections = [
      { id: pick('remove_empty').id },
      { id: pick('retitle').id },
      { id: pick('move_ai_notes').id },
      { id: pick('split', 0).id, entityType: 'concept' as const },
      { id: pick('split', 1).id },
    ];

    const result = await tidy.apply(projectId, selections);
    expect(result.proposal.status).toBe('applied');
    expect(result.proposal.kind).toBe('bible_audit');

    const after = await snapshot();
    expect(after.docs.some(doc => doc.startsWith('project/default|'))).toBe(false);
    expect(after.docs.some(doc => doc.startsWith('world/default|'))).toBe(true);
    expect(after.docs.find(doc => doc.startsWith('world/lock-tolls|'))).toContain('"title":"Barge Tolls"');
    expect(after.docs.find(doc => doc.startsWith('world/canal-city|'))).toBe('world/canal-city|{"title":"Canal City"}|The canal city floods every spring.\n\nBargemen never swim.');
    expect(after.docs.find(doc => doc.startsWith('ai/world-notes|'))).toContain('## From Canal City\n\nSchema note: the brief fields must set knowledgeContract');
    expect(after.docs.find(doc => doc.startsWith('world/delta-powers|'))).toBe(before.docs.find(doc => doc.startsWith('world/delta-powers|')));
    expect(after.entities).toEqual(['lantern_order|faction|Lantern Order', 'the_salt_guild|concept|The Salt Guild']);

    const remaining = await tidy.preview(projectId);
    expect(remaining.filter(item => item.kind === 'split').map(item => item.entityKey)).toEqual(['house_varenne', 'the_reed_compact']);

    await applier.revert(projectId, result.proposal.id);
    expect(await snapshot()).toEqual(before);
  });

  it('should apply a repeated selection once', async () => {
    const before = await snapshot();
    const items = await tidy.preview(projectId);
    const note = items.find(item => item.kind === 'move_ai_notes');
    const empty = items.find(item => item.kind === 'remove_empty');
    if (!note || !empty) throw new Error('fixture lost its note or placeholder');

    const result = await tidy.apply(projectId, [{ id: note.id }, { id: note.id }, { id: empty.id }, { id: empty.id }]);
    expect(result.proposal.changeSet).toHaveLength(3);
    const after = await snapshot();
    expect(after.docs.find(doc => doc.startsWith('world/canal-city|'))).toBe('world/canal-city|{"title":"Canal City"}|The canal city floods every spring.\n\nBargemen never swim.');
    expect(after.docs.find(doc => doc.startsWith('ai/world-notes|'))?.match(/Schema note/g)).toHaveLength(1);

    await applier.revert(projectId, result.proposal.id);
    expect(await snapshot()).toEqual(before);
  });

  it('should discard the staged proposal when the apply fails', async () => {
    const failing = { apply: () => Promise.reject(new Error('apply failed')) } as unknown as ProposalApplyService;
    const service = new BibleTidyService(databaseService(), new ProposalService(databaseService()), failing);
    const [item] = await service.preview(projectId);
    if (!item) throw new Error('fixture has nothing to tidy');

    await expect(service.apply(projectId, [{ id: item.id }])).rejects.toThrow('apply failed');
    const latest = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.projectId, projectId), orderBy: [desc(schema.refinementProposals.id)] });
    expect(latest?.status).toBe('discarded');
  });

  it('should refuse a selection the bible no longer yields', async () => {
    const items = await tidy.preview(projectId);
    const note = items.find(item => item.kind === 'move_ai_notes');
    if (!note) throw new Error('fixture lost its note');
    await db
      .update(schema.bibleDocuments)
      .set({ body: WITH_NOTE.replace('knowledgeContract', 'knowledgeContract and writerNote') })
      .where(eq(schema.bibleDocuments.slug, 'canal-city'));

    await expect(tidy.apply(projectId, [{ id: note.id }])).rejects.toMatchObject({ code: 'DOC_002' });
  });
});
