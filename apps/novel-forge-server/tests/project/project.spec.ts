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
import { DEFAULT_WRITING_INSTRUCTIONS } from '@modules/ai/prompts/authoring-preamble';
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

    it('should allow two projects with the same name, distinguished by id', async () => {
      const first = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'dup', kind: 'new_novel' });
      const second = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'dup', kind: 'new_novel' });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json().id).not.toBe(first.json().id);
    });
  });

  describe('GET /api/v1/projects/:projectId', () => {
    it('should return 404 for unknown project', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/projects/999999');
      expect(response.statusCode).toBe(404);
    });
  });

  describe('chapter writing instructions', () => {
    it('should pre-fill new projects with the default writing instructions', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'wi-default', kind: 'new_novel' });
      expect(response.statusCode).toBe(201);
      expect(response.json().instructions).toBe(DEFAULT_WRITING_INSTRUCTIONS);
    });

    it('should persist a custom instruction and echo it back', async () => {
      const created = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'wi-custom', kind: 'new_novel' });
      const id = created.json().id;
      const custom = 'Write terse, punchy chapters of about 1200 words.';

      const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ instructions: custom });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().instructions).toBe(custom);

      const fetched = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${id}`);
      expect(fetched.json().instructions).toBe(custom);
    });

    it('should reset to the default when the instruction is cleared', async () => {
      const created = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'wi-reset', kind: 'new_novel', instructions: 'custom for now' });
      const id = created.json().id;
      expect(created.json().instructions).toBe('custom for now');

      const cleared = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ instructions: '' });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().instructions).toBe(DEFAULT_WRITING_INSTRUCTIONS);
    });
  });
});
