/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type NovelBundle } from '@modules/novel-import/novel-import.dto';
import { TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Proves the body-limit scoping (novel-import-format.md §7): POST /api/v1/import alone gets a raised
 * per-route bodyLimit; every other write route stays under the app-wide 12MB default.
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

const testEnv = new TestEnvironment('novel_import_body_limit');

describe.if(pgAvailable)('body-limit scoping', () => {
  testEnv.init();

  it('should accept an import bundle bigger than the app-wide 12MB limit on POST /api/v1/import', async () => {
    // ~20MB of chapter content — over the global 12MB default, under the route's 64MB override and
    // the validator's 48MB sanity cap.
    const content = 'a'.repeat(20 * 1024 * 1024);
    const bundle: NovelBundle = {
      format: 'novel-import',
      schemaVersion: 1,
      mode: 'source',
      novel: { title: 'Big Bundle', synopsis: 'A bundle bigger than the app-wide body limit.' },
      volumes: [{ ordinal: 1, chapters: [{ title: 'A Long Chapter', content }] }],
    };
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/import').body({ bundle });
    expect(response.statusCode).toBe(202);
  });

  it('should still reject an oversized body on a different write route at the app-wide 12MB limit', async () => {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: 'x'.repeat(20 * 1024 * 1024), kind: 'new_novel' });
    expect(response.statusCode).toBe(413);
  });
});
