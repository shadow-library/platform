import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { BibleReadinessService } from '@modules/bible/readiness/bible-readiness.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_bible_readiness`;

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

const PROSE = 'word '.repeat(300);

describe.if(pgAvailable)('BibleReadinessService', () => {
  let db: PrimaryDatabase;
  let service: BibleReadinessService;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    service = new BibleReadinessService({ getPostgresClient: () => db } as never);
  });

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `readiness-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('should cover roles from titled documents, entities, volumes and arcs', async () => {
    const projectId = await seedProject();
    await db.insert(schema.bibleDocuments).values([
      { projectId, section: 'project', slug: 'premise', body: PROSE },
      { projectId, section: 'world', slug: 'setting-overview', body: PROSE },
      { projectId, section: 'plot', slug: 'escalation-map', body: PROSE },
      { projectId, section: 'power', slug: 'notes-1', frontmatter: { title: 'Rules and Limits' }, body: PROSE },
      { projectId, section: 'world', slug: 'factions', body: PROSE },
    ]);
    const entity = (key: string, type: 'character' | 'faction' | 'location' | 'power_rule', significance: 'major' | 'minor' = 'minor') => ({
      projectId,
      entityKey: key,
      name: key,
      type,
      significance,
      body: 'card',
    });
    await db
      .insert(schema.entities)
      .values([
        entity('lead', 'character', 'major'),
        entity('friend', 'character'),
        entity('rival', 'character'),
        entity('guild', 'faction'),
        entity('crown', 'faction'),
        entity('port', 'location'),
        entity('keep', 'location'),
        entity('ford', 'location'),
        ...['a', 'b', 'c', 'd'].map(key => entity(`rule_${key}`, 'power_rule')),
      ]);
    await db.insert(schema.volumes).values([
      { projectId, volumeKey: 'v1', ordinal: 1, objective: 'escape the city' },
      { projectId, volumeKey: 'v2', ordinal: 2, objective: 'win the war' },
    ]);
    await db.insert(schema.arcs).values([
      { projectId, arcKey: 'a1', volumeKey: 'v1', ordinal: 1 },
      { projectId, arcKey: 'a2', volumeKey: 'v1', ordinal: 2 },
      { projectId, arcKey: 'a3', volumeKey: 'v2', ordinal: 1 },
    ]);

    const report = await service.score(projectId);

    expect(report.readyToDraft).toBe(true);
    const coveredBy = Object.fromEntries(report.roles.map(role => [role.stage, role.coveredBy]));
    expect(coveredBy['power']).toEqual(['power/notes-1']);
    expect(coveredBy['characters']).toEqual(['3 character records']);
    expect(coveredBy['volumes']).toEqual(['2 volumes with objectives and 3 arcs']);
  });

  it('should report an empty project as not ready', async () => {
    const report = await service.score(await seedProject());
    expect(report.readyToDraft).toBe(false);
    expect(report.roles.every(role => !role.covered)).toBe(true);
  });
});
