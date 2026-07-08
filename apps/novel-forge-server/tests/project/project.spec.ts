/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { SQL } from 'bun';

/**
 * Importing user defined packages
 */
import { TEST_REGEX, TestEnvironment } from '@tests/test-environment';

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

const testEnv = new TestEnvironment('project_test');

describe.if(pgAvailable)('Projects API', () => {
  testEnv.init();

  describe('POST /api/v1/projects', () => {
    it('should create a source project', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({
        name: 'test-source',
        kind: 'source',
        url: 'https://example.com/novel',
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(TEST_REGEX.id);
      expect(body.name).toBe('test-source');
      expect(body.kind).toBe('source');
    });

    it('should create a new_novel project', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({
        name: 'test-novel',
        kind: 'new_novel',
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().kind).toBe('new_novel');
    });

    it('should return 409 for duplicate name', async () => {
      await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'dup', kind: 'new_novel' });
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'dup', kind: 'new_novel' });
      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET /api/v1/projects/:projectId', () => {
    it('should return 404 for unknown project', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/projects/999999');
      expect(response.statusCode).toBe(404);
    });
  });
});
