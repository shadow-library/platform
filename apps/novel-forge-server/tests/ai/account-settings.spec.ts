import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { AccountSettingsService } from '@modules/ai/account-settings.service';
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

const testEnv = new TestEnvironment('account_settings_test');

const OPUS = { provider: 'openrouter', model: 'anthropic/claude-opus-5' };
const GLM = { provider: 'openrouter', model: 'z-ai/glm-5.2' };

describe.if(pgAvailable)('Account settings API', () => {
  testEnv.init();

  it('should return no defaults for an author who never saved any', async () => {
    const response = await testEnv.getRouter().mockRequest().get('/api/v1/ai/settings');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ models: {} });
  });

  it('should replace the whole set of defaults on save', async () => {
    await testEnv
      .getRouter()
      .mockRequest()
      .put('/api/v1/ai/settings')
      .body({ models: { ideation: OPUS, writing: GLM } });

    const saved = await testEnv
      .getRouter()
      .mockRequest()
      .put('/api/v1/ai/settings')
      .body({ models: { ideation: GLM } });
    const read = await testEnv.getRouter().mockRequest().get('/api/v1/ai/settings');

    expect(saved.statusCode).toBe(200);
    expect(read.json()).toEqual({ models: { ideation: GLM } });
  });

  it('should reject a model that is not in the registry', async () => {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .put('/api/v1/ai/settings')
      .body({ models: { chat: { provider: 'openrouter', model: 'made-up/model' } } });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('AI_002');
  });

  it('should reject an image model for a text group and a text model for illustrations', async () => {
    const image = { provider: 'openrouter', model: 'x-ai/grok-imagine-image-2.0' };

    const imageForText = await testEnv
      .getRouter()
      .mockRequest()
      .put('/api/v1/ai/settings')
      .body({ models: { writing: image } });
    const textForImage = await testEnv
      .getRouter()
      .mockRequest()
      .put('/api/v1/ai/settings')
      .body({ models: { image: OPUS } });

    expect(imageForText.json().code).toBe('AI_002');
    expect(textForImage.json().code).toBe('AI_002');
  });

  it("should hand the router the project owner's defaults, looked up by project id", async () => {
    await testEnv
      .getRouter()
      .mockRequest()
      .put('/api/v1/ai/settings')
      .body({ models: { ideation: GLM } });
    const projectId = BigInt((await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'owned', kind: 'new_novel' })).json().id);

    const defaults = await testEnv.getService(AccountSettingsService).defaultsFor(undefined, projectId);

    expect(defaults).toEqual({ ideation: GLM });
  });

  it('should find no defaults for a project whose owner never saved any', async () => {
    const projectId = BigInt((await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'plain', kind: 'new_novel' })).json().id);

    expect(await testEnv.getService(AccountSettingsService).defaultsFor(undefined, projectId)).toBeUndefined();
  });
});
