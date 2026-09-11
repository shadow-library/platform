import { join } from 'node:path';

import { SQL } from 'bun';
import { afterAll, describe, expect, it } from 'bun:test';
import { Config } from '@shadow-library/common';

import { TestEnvironment } from '@tests/test-environment';

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

Config['cache'].set('plugins.dir', join(import.meta.dir, 'fixtures'));
afterAll(() => Config['cache'].set('plugins.dir', ''));

const testEnv = new TestEnvironment('plugin_fixture');

describe.if(pgAvailable)('GET /api/v1/plugins with plugins.dir set to a real directory', () => {
  testEnv.init();

  it('should list the twin-track fixture loaded from the fixtures directory', async () => {
    const response = await testEnv.getRouter().mockRequest().get('/api/v1/plugins');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: 'twin-track',
        decisionPoints: ['canon.augment', 'brief.policy', 'call.route', 'context.contribute', 'prompt.contribute'],
        exclusive: ['brief.policy', 'call.route'],
        forms: {
          settings: {
            fields: [
              { name: 'markedChapters', type: 'string', title: 'Marked chapters' },
              { name: 'noteText', type: 'string', title: 'Note text', widget: 'textarea' },
              { name: 'addFact', type: 'boolean', title: 'Add fact' },
            ],
          },
        },
      }),
    ]);
  });
});
