import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config } from '@shadow-library/common';

import { getProfileDefaults } from '@modules/ai/defaults';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { IllustrationModule } from '@modules/illustration/illustration.module';
import { IllustrationService } from '@modules/illustration/illustration.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_illustration`;

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

// The router and the image call read credentials straight off the Config cache, which no test
// bootstrap populates.
function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

interface ImageRequest {
  model: string;
  prompt: string;
}

// Object storage itself (content-addressing, public URLs, the local/S3 providers) is exercised in
// `@shadow-library/modules`' storage-module suite; here we stub it down to a fixed ref.
function buildService(db: PrimaryDatabase, requests: ImageRequest[]): IllustrationService {
  const storage = { save: async () => 'ref-1', getPublicUrl: (ref: string) => `https://cdn.test/${ref}` };
  const router = new ModelRouterService({} as never, { getPostgresClient: () => db } as never);
  const service = new IllustrationService({ getPostgresClient: () => db } as never, storage as never, router);
  (globalThis as unknown as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
    requests.push(JSON.parse(init.body) as ImageRequest);
    return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from('png').toString('base64') }] }) };
  };
  return service;
}

describe('IllustrationService', () => {
  it('should expose the service and module', () => {
    expect(IllustrationService).toBeDefined();
    expect(IllustrationModule).toBeDefined();
  });
});

describe.if(pgAvailable)('IllustrationService — project scoping and model routing', () => {
  let db: PrimaryDatabase;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    setConfig('ai.openrouter.api.key', 'test-key');
    setConfig('ai.openrouter.api.url', 'https://openrouter.test/api/v1');
  });

  afterAll(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
    return (db as unknown as { $client: SQL }).$client.close();
  });

  async function seedProject(name: string, config: Record<string, unknown> | null = null, contentMode: 'standard' | 'grok_only' = 'standard'): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `${name}-${Date.now()}-${Math.random()}`, kind: 'source', contentMode, config: config as never })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('should look up the entity within the requesting project only', async () => {
    const mine = await seedProject('illustration-mine');
    const theirs = await seedProject('illustration-theirs');
    await db.insert(schema.entities).values([
      { projectId: mine, entityKey: 'hero', type: 'character', name: 'Evan Vale' },
      { projectId: theirs, entityKey: 'hero', type: 'character', name: 'Someone Else' },
    ]);

    const requests: ImageRequest[] = [];
    const service = buildService(db, requests);
    await service.start(mine, 'hero', {});

    expect(requests[0]?.prompt).toContain('Evan Vale');
    expect(requests[0]?.prompt).not.toContain('Someone Else');
  });

  it('should write the saved image path to the session project entity, never a namesake in another project', async () => {
    const mine = await seedProject('illustration-save-mine');
    const theirs = await seedProject('illustration-save-theirs');
    await db.insert(schema.entities).values([
      { projectId: mine, entityKey: 'villain', type: 'character', name: 'Mara' },
      { projectId: theirs, entityKey: 'villain', type: 'character', name: 'Mara Elsewhere' },
    ]);

    const service = buildService(db, []);
    const { sessionId } = await service.start(mine, 'villain', {});
    await service.save(sessionId);

    const own = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, mine), eq(schema.entities.entityKey, 'villain')) });
    const other = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, theirs), eq(schema.entities.entityKey, 'villain')) });
    expect(own?.imagePath).toBe('ref-1');
    expect(other?.imagePath).toBeNull();
  });

  it('should route the image call through the image model group by default', async () => {
    const projectId = await seedProject('illustration-default-model');
    const requests: ImageRequest[] = [];
    const service = buildService(db, requests);
    await service.start(projectId, 'nobody', {});

    expect(requests[0]?.model).toBe(getProfileDefaults()['image'].model);
  });

  it("should honour the project's image model override", async () => {
    const projectId = await seedProject('illustration-override-model', { models: { image: { provider: 'openrouter', model: 'openai/gpt-5.4-image-2' } } });
    const requests: ImageRequest[] = [];
    const service = buildService(db, requests);
    await service.start(projectId, 'nobody', {});

    expect(requests[0]?.model).toBe('openai/gpt-5.4-image-2');
  });

  it('should keep grok_only projects on the Grok image model rather than its text pin', async () => {
    const projectId = await seedProject('illustration-grok-only', null, 'grok_only');
    const requests: ImageRequest[] = [];
    const service = buildService(db, requests);
    await service.start(projectId, 'nobody', {});

    expect(requests[0]?.model).toBe('x-ai/grok-imagine-image-2.0');
  });
});
