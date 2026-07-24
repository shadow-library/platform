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
const testEnv = new TestEnvironment('template_test');
const router = () => testEnv.getRouter().mockRequest().headers(testEnv.authHeaders());

describe('Template', () => {
  testEnv.init();

  describe('POST /v1/templates', () => {
    it('should create a template with sensible defaults', async () => {
      const body = { templateKey: 'demo.welcome', name: 'Demo welcome', messageType: 'TRANSACTIONAL', description: 'A demo template' };

      const response = await router().post('/api/v1/templates').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        id: expect.stringMatching(TEST_REGEX.id),
        templateKey: 'demo.welcome',
        name: 'Demo welcome',
        messageType: 'TRANSACTIONAL',
        description: 'A demo template',
        priority: 'MEDIUM',
        isActive: true,
        variableSchema: { variables: {} },
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 409 when the template key already exists', async () => {
      const response = await router().post('/api/v1/templates').body({ templateKey: 'sign-up', name: 'Dup', messageType: 'TRANSACTIONAL' });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'TPL_002' });
    });

    it('should return 422 for an invalid message type', async () => {
      const response = await router().post('/api/v1/templates').body({ templateKey: 'demo.bad', name: 'Bad', messageType: 'NOPE' });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /v1/templates', () => {
    it('should list all seeded templates', async () => {
      const response = await router().get('/api/v1/templates');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ total: 19, limit: 20, offset: 0 });
    });

    it('should filter templates by key', async () => {
      const response = await router().get('/api/v1/templates?key=auth');

      expect(response.statusCode).toBe(200);
      expect(response.json().total).toBe(7);
    });
  });

  describe('GET /v1/templates/:templateId', () => {
    it('should return a template with its channel settings', async () => {
      const response = await router().get('/api/v1/templates/1');

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json).toMatchObject({ id: '1', templateKey: 'sign-up', messageType: 'TRANSACTIONAL' });
      expect([...json.channels.map((channel: { channel: string }) => channel.channel)].sort()).toEqual(['EMAIL', 'SMS']);
    });

    it('should return 404 for a non-existent template', async () => {
      const response = await router().get('/api/v1/templates/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_001' });
    });
  });

  describe('PATCH /v1/templates/:templateId', () => {
    it('should update template metadata', async () => {
      const response = await router().patch('/api/v1/templates/1').body({ description: 'Updated', priority: 'HIGH' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: '1', templateKey: 'sign-up', description: 'Updated', priority: 'HIGH' });
    });
  });

  describe('PUT /v1/templates/:templateId/channels/:channel', () => {
    it('should toggle a channel setting', async () => {
      const response = await router().put('/api/v1/templates/1/channels/SMS').body({ isEnabled: false });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ templateId: '1', channel: 'SMS', isEnabled: false });

      const detail = await router().get('/api/v1/templates/1');
      const sms = detail.json().channels.find((channel: { channel: string }) => channel.channel === 'SMS');
      expect(sms.isEnabled).toBe(false);
    });
  });

  describe('version lifecycle', () => {
    it('should draft, edit, publish, re-edit, and roll back a template', async () => {
      const create = await router()
        .post('/api/v1/templates')
        .body({ templateKey: 'demo.flow', name: 'Demo flow', messageType: 'TRANSACTIONAL', variableSchema: { variables: { name: { type: 'string', required: false } } } });
      const templateId = create.json().id;
      await router().put(`/api/v1/templates/${templateId}/channels/EMAIL`).body({ isEnabled: true });

      /** Open the first draft (v1) and write email content. */
      const draft = await router().post(`/api/v1/templates/${templateId}/versions/draft`);
      expect(draft.statusCode).toBe(201);
      expect(draft.json()).toMatchObject({ version: 1, status: 'DRAFT' });

      const content = await router()
        .put(`/api/v1/templates/${templateId}/versions/draft/contents`)
        .body({ channel: 'EMAIL', subject: 'Hi {{ name }}', body: '<p>Hi {{ name }}</p>', layoutKey: 'default' });
      expect(content.statusCode).toBe(200);
      expect(content.json()).toMatchObject({ channel: 'EMAIL', locale: 'en-ZZ' });

      const publish = await router().post(`/api/v1/templates/${templateId}/versions/draft/publish`).body({ notes: 'first release' });
      expect(publish.statusCode).toBe(200);
      expect(publish.json()).toMatchObject({ version: 1, status: 'PUBLISHED' });

      /** Preview renders the published version through the engine + layout. */
      const preview = await router()
        .post(`/api/v1/templates/${templateId}/versions/preview`)
        .body({ channel: 'EMAIL', data: { name: 'Bob' } });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().subject).toBe('Hi Bob');
      expect(preview.json().body).toContain('Hi Bob');

      /** Re-edit: a new draft clones v1, edits, and publishing archives v1. */
      const draft2 = await router().post(`/api/v1/templates/${templateId}/versions/draft`);
      expect(draft2.json()).toMatchObject({ version: 2, status: 'DRAFT' });
      await router()
        .put(`/api/v1/templates/${templateId}/versions/draft/contents`)
        .body({ channel: 'EMAIL', subject: 'Hey {{ name }}', body: '<p>Hey {{ name }}</p>', layoutKey: 'default' });
      const publish2 = await router().post(`/api/v1/templates/${templateId}/versions/draft/publish`).body({});
      expect(publish2.json()).toMatchObject({ version: 2, status: 'PUBLISHED' });

      const versions = await router().get(`/api/v1/templates/${templateId}/versions`);
      const statuses = Object.fromEntries(versions.json().items.map((v: { version: number; status: string }) => [v.version, v.status]));
      expect(statuses).toEqual({ 1: 'ARCHIVED', 2: 'PUBLISHED' });

      /** Rollback re-publishes a copy of v1 as v3 and archives v2. */
      const rollback = await router().post(`/api/v1/templates/${templateId}/versions/1/rollback`).body({});
      expect(rollback.json()).toMatchObject({ version: 3, status: 'PUBLISHED' });
      const previewAfter = await router()
        .post(`/api/v1/templates/${templateId}/versions/preview`)
        .body({ channel: 'EMAIL', data: { name: 'Bob' } });
      expect(previewAfter.json().subject).toBe('Hi Bob');
    });

    it('should return 409 when publishing with no draft', async () => {
      const response = await router().post('/api/v1/templates/1/versions/draft/publish').body({});

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'TPL_PUB_001' });
    });

    it('should reject publishing content that references an undeclared variable', async () => {
      const create = await router().post('/api/v1/templates').body({ templateKey: 'demo.badvar', name: 'Bad var', messageType: 'TRANSACTIONAL' });
      const templateId = create.json().id;
      await router()
        .put(`/api/v1/templates/${templateId}/versions/draft/contents`)
        .body({ channel: 'EMAIL', subject: 'Hello', body: '<p>{{ undeclared }}</p>', layoutKey: 'default' });

      const publish = await router().post(`/api/v1/templates/${templateId}/versions/draft/publish`).body({});

      expect(publish.statusCode).toBe(422);
      expect(publish.json()).toMatchObject({ code: 'TPL_PUB_003' });
    });
  });
});
