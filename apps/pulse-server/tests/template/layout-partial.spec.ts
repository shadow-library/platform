/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

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
const testEnv = new TestEnvironment('layout_partial_test');
const router = () => testEnv.getRouter().mockRequest().headers(testEnv.authHeaders());

describe('Layouts', () => {
  testEnv.init();

  it('should list the seeded default layout', async () => {
    const response = await router().get('/api/v1/layouts');

    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((layout: { layoutKey: string }) => layout.layoutKey)).toContain('default');
  });

  it('should return a layout with its published version', async () => {
    const response = await router().get('/api/v1/layouts/1');

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json).toMatchObject({ id: '1', layoutKey: 'default' });
    expect(json.versions[0]).toMatchObject({ version: 1, status: 'PUBLISHED' });
  });

  it('should create, draft, and publish a layout', async () => {
    const create = await router().post('/api/v1/layouts').body({ layoutKey: 'promo', name: 'Promo shell' });
    expect(create.statusCode).toBe(201);
    const layoutId = create.json().id;

    const draft = await router().put(`/api/v1/layouts/${layoutId}/draft`).body({ body: '<div class="promo">{{ content | raw }} — {{ brand.name }}</div>' });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({ version: 1, status: 'DRAFT' });

    const publish = await router().post(`/api/v1/layouts/${layoutId}/publish`).body({});
    expect(publish.statusCode).toBe(200);
    expect(publish.json()).toMatchObject({ version: 1, status: 'PUBLISHED' });
  });

  it('should return 409 when the layout key already exists', async () => {
    const response = await router().post('/api/v1/layouts').body({ layoutKey: 'default', name: 'Dup' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'TPL_LYT_002' });
  });

  it('should return 409 when publishing a layout with no draft', async () => {
    const create = await router().post('/api/v1/layouts').body({ layoutKey: 'empty', name: 'Empty' });
    const response = await router().post(`/api/v1/layouts/${create.json().id}/publish`).body({});

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'TPL_PUB_001' });
  });
});

describe('Partials', () => {
  testEnv.init();

  it('should list the seeded partials', async () => {
    const response = await router().get('/api/v1/partials');

    expect(response.statusCode).toBe(200);
    const keys = response.json().items.map((partial: { partialKey: string }) => partial.partialKey);
    expect(keys).toEqual(expect.arrayContaining(['otp-code', 'button']));
  });

  it('should create, draft, and publish a partial', async () => {
    const create = await router().post('/api/v1/partials').body({ partialKey: 'alert', name: 'Alert panel' });
    expect(create.statusCode).toBe(201);
    expect(create.json().id).toMatch(TEST_REGEX.id);
    const partialId = create.json().id;

    const draft = await router().put(`/api/v1/partials/${partialId}/draft`).body({ body: '<div class="email-panel">{{ message }}</div>' });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({ version: 1, status: 'DRAFT' });

    const publish = await router().post(`/api/v1/partials/${partialId}/publish`).body({});
    expect(publish.statusCode).toBe(200);
    expect(publish.json()).toMatchObject({ version: 1, status: 'PUBLISHED' });
  });

  it('should return 409 when the partial key already exists', async () => {
    const response = await router().post('/api/v1/partials').body({ partialKey: 'button', name: 'Dup' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'TPL_PRT_002' });
  });
});
