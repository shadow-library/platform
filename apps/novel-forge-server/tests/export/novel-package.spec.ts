/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { SQL } from 'bun';
import { unzipSync } from 'fflate';

/**
 * Importing user defined packages
 */
import { NovelPackageService } from '@modules/export';
import * as schema from '@server/database/schemas';
import { TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

interface Manifest {
  schemaVersion: number;
  id: string;
  title: string;
  description?: string;
  chapters: { title: string; file: string }[];
}

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

const testEnv = new TestEnvironment('novel_package');

function readEntries(bytes: Uint8Array): Record<string, string> {
  const raw = unzipSync(bytes);
  const decoder = new TextDecoder();
  return Object.fromEntries(Object.entries(raw).map(([name, data]) => [name, decoder.decode(data)]));
}

describe.if(pgAvailable)('Novel package export', () => {
  testEnv.init();

  async function seedProject(kind: 'source' | 'new_novel' = 'new_novel'): Promise<bigint> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `export-${Math.random()}`, kind, title: 'The Iron Saga', ...(kind === 'source' ? { url: 'https://example.com/novel' } : {}) });
    return BigInt(response.json().id as string);
  }

  it('builds a schema-1 package with a manifest and one Markdown file per chapter', async () => {
    const projectId = await seedProject();
    await testEnv
      .getPostgresClient()
      .insert(schema.chapters)
      .values([
        { projectId, number: 1, title: 'Awakening', content: 'The gate opened.', status: 'done' },
        { projectId, number: 2, title: 'The Road', content: 'They marched east.', status: 'done' },
      ]);

    const pkg = await testEnv.getService(NovelPackageService).build(projectId);
    expect(pkg.chapterCount).toBe(2);
    expect(pkg.filename).toBe(pkg.id + '.novel');

    const entries = readEntries(pkg.bytes);
    const manifest = JSON.parse(entries['manifest.json'] as string) as Manifest;
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.id.length).toBeGreaterThan(0);
    expect(manifest.title).toBe('The Iron Saga');
    expect(manifest.chapters).toEqual([
      { title: 'Awakening', file: 'chapters/0001.md' },
      { title: 'The Road', file: 'chapters/0002.md' },
    ]);
    // Every manifest chapter file exists in the archive with its prose.
    expect(entries['chapters/0001.md']).toBe('The gate opened.');
    expect(entries['chapters/0002.md']).toBe('They marched east.');
  });

  it('titles untitled chapters positionally', async () => {
    const projectId = await seedProject();
    await testEnv
      .getPostgresClient()
      .insert(schema.chapters)
      .values([{ projectId, number: 5, title: null, content: 'No title here.', status: 'done' }]);

    const pkg = await testEnv.getService(NovelPackageService).build(projectId);
    const manifest = JSON.parse(readEntries(pkg.bytes)['manifest.json'] as string) as Manifest;
    expect(manifest.chapters).toEqual([{ title: 'Chapter 5', file: 'chapters/0005.md' }]);
  });

  it('falls back to drafts when no canonical chapters exist yet', async () => {
    const projectId = await seedProject();
    await testEnv
      .getPostgresClient()
      .insert(schema.drafts)
      .values([{ projectId, chapter: 1, title: 'Draft One', body: 'Draft prose.', status: 'draft', reviewStatus: 'needs_review', generator: 'standard' }]);

    const pkg = await testEnv.getService(NovelPackageService).build(projectId);
    const entries = readEntries(pkg.bytes);
    const manifest = JSON.parse(entries['manifest.json'] as string) as Manifest;
    expect(manifest.chapters).toEqual([{ title: 'Draft One', file: 'chapters/0001.md' }]);
    expect(entries['chapters/0001.md']).toBe('Draft prose.');
  });

  it('serves the package over HTTP as a .novel attachment', async () => {
    const projectId = await seedProject();
    await testEnv
      .getPostgresClient()
      .insert(schema.chapters)
      .values([{ projectId, number: 1, title: 'Awakening', content: 'The gate opened.', status: 'done' }]);

    const res = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/export/novel`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(String(res.headers['content-disposition'])).toContain('.novel');
    const manifest = JSON.parse(readEntries(new Uint8Array(res.rawPayload))['manifest.json'] as string) as Manifest;
    expect(manifest.schemaVersion).toBe(1);
  });

  it('rejects an export with no chapters as EXP_001', async () => {
    const projectId = await seedProject();
    const res = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/export/novel`);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('EXP_001');
  });
});
