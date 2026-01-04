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
const testEnv = new TestEnvironment('shadow_pulse_template_variant_test');

describe('Template Variant', () => {
  testEnv.init();

  describe('POST /v1/template-groups/:groupId/variants', () => {
    it('should create a template variant with EMAIL channel', async () => {
      const body = {
        channel: 'EMAIL',
        locale: 'fr-FR',
        subject: 'Bienvenue chez Shadow',
        body: 'Bonjour {{name}}, merci de vous être inscrit!',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        ...body,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a template variant with SMS channel', async () => {
      const body = {
        channel: 'SMS',
        locale: 'fr-FR',
        body: 'Bienvenue {{name}}, votre compte est prêt.',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        channel: 'SMS',
        locale: 'fr-FR',
        body: body.body,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a template variant with PUSH channel', async () => {
      const body = {
        channel: 'PUSH',
        locale: 'de-DE',
        subject: 'Willkommen',
        body: 'Willkommen {{name}}, Ihr Konto ist bereit.',
        isActive: false,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        ...body,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 409 conflict when channel and locale combination already exists', async () => {
      const body = {
        channel: 'EMAIL',
        locale: 'en-US',
        subject: 'Welcome Duplicate',
        body: 'This is a duplicate',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'TPL_VRT_002' });
    });

    it('should return 404 when template group does not exist', async () => {
      const body = {
        channel: 'EMAIL',
        locale: 'en-US',
        subject: 'Test Subject',
        body: 'Test body',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/99999/variants').body(body);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_GRP_001' });
    });

    it('should return 422 when subject is missing for EMAIL channel', async () => {
      const body = {
        channel: 'EMAIL',
        locale: 'es-ES',
        body: 'Test body without subject',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid channel', async () => {
      const body = {
        channel: 'INVALID_CHANNEL',
        locale: 'en-US',
        body: 'Test body',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid group ID format', async () => {
      const body = {
        channel: 'EMAIL',
        locale: 'en-US',
        subject: 'Test Subject',
        body: 'Test body',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/invalid-id/variants').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 when required fields are missing', async () => {
      const body = {
        channel: 'SMS',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should create template channel settings when first variant is added for a channel', async () => {
      const db = testEnv.getPrimaryDatabase();
      const body = {
        channel: 'EMAIL',
        locale: 'en-US',
        subject: 'Spring Promo',
        body: 'Check out our spring promotions!',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/5/variants').body(body);
      expect(response.statusCode).toBe(201);

      const settingsAfter = await db.query.templateChannelSettings.findMany({ where: (settings, { eq }) => eq(settings.templateGroupId, 5n) });
      expect(settingsAfter).toHaveLength(1);
      expect(settingsAfter[0]).toMatchObject({
        templateGroupId: 5n,
        channel: 'EMAIL',
        isEnabled: true,
      });
    });

    it('should not add or update channel settings when second variant is added for same channel', async () => {
      const db = testEnv.getPrimaryDatabase();
      const body = {
        channel: 'SMS',
        locale: 'fr-FR',
        body: 'Second SMS variant in French',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups/1/variants').body(body);
      expect(response.statusCode).toBe(201);

      const setting = await db.query.templateChannelSettings.findFirst({ where: (settings, { and, eq }) => and(eq(settings.templateGroupId, 1n), eq(settings.channel, 'SMS')) });
      expect(setting).toStrictEqual({
        templateGroupId: 1n,
        channel: 'SMS',
        isEnabled: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      });
    });
  });

  describe('GET /v1/template-groups/:groupId/variants', () => {
    it('should list all template variants for a group', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 2,
        limit: 20,
        offset: 0,
        items: expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(TEST_REGEX.id),
            channel: expect.any(String),
            locale: expect.any(String),
            body: expect.any(String),
            isActive: expect.any(Boolean),
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          }),
        ]),
      });
    });

    it('should filter template variants by channel', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants?channel=EMAIL');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '1',
            channel: 'EMAIL',
            locale: 'en-US',
            subject: 'Welcome to Shadow',
            body: 'Hi {{name}}, thanks for signing up!',
            isActive: true,
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          },
        ],
      });
    });

    it('should filter template variants by locale', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants?locale=en-US');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 2,
        limit: 20,
        offset: 0,
        items: expect.arrayContaining([expect.objectContaining({ locale: 'en-US' })]),
      });
    });

    it('should filter template variants by both channel and locale', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants?channel=SMS&locale=en-US');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '2',
            channel: 'SMS',
            locale: 'en-US',
            body: 'Welcome {{name}}, your account is ready.',
            isActive: true,
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          },
        ],
      });
    });

    it('should return empty list when no variants match filter', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants?channel=PUSH');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 0,
        limit: 20,
        offset: 0,
        items: [],
      });
    });

    it('should support pagination', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants?limit=1&offset=0');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 2,
        limit: 1,
        offset: 0,
        items: expect.any(Array),
      });
      expect(response.json().items).toHaveLength(1);
    });

    it('should return 404 when template group does not exist', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/99999/variants');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_GRP_001' });
    });

    it('should return 422 for invalid group ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/invalid-id/variants');

      expect(response.statusCode).toBe(422);
    });

    it('should ignore invalid channel filter and return all variants', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants?channel=INVALID');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 2,
        limit: 20,
        offset: 0,
      });
    });
  });

  describe('GET /v1/template-groups/:groupId/variants/:variantId', () => {
    it('should get a template variant by ID', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants/1');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        channel: 'EMAIL',
        locale: 'en-US',
        subject: 'Welcome to Shadow',
        body: 'Hi {{name}}, thanks for signing up!',
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should get SMS template variant', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants/2');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '2',
        channel: 'SMS',
        locale: 'en-US',
        body: 'Welcome {{name}}, your account is ready.',
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 404 for non-existent template variant', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_VRT_001' });
    });

    it('should return 404 when variant exists but group does not match', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/2/variants/1');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_VRT_001' });
    });

    it('should return 422 for invalid group ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/invalid-id/variants/1');

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid variant ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants/invalid-id');

      expect(response.statusCode).toBe(422);
    });
  });

  describe('PATCH /v1/template-groups/:groupId/variants/:variantId', () => {
    it('should update a template variant', async () => {
      const updateBody = {
        subject: 'Updated Subject',
        body: 'Updated body content',
        isActive: false,
      };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        channel: 'EMAIL',
        locale: 'en-US',
        ...updateBody,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should partially update only the body', async () => {
      const updateBody = { body: 'Only body updated' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        channel: 'EMAIL',
        locale: 'en-US',
        subject: 'Welcome to Shadow',
        body: updateBody.body,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should partially update only the subject', async () => {
      const updateBody = { subject: 'New Subject Only' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '1',
        subject: updateBody.subject,
      });
    });

    it('should update isActive status', async () => {
      const updateBody = { isActive: false };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/2').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '2',
        isActive: false,
      });
    });

    it('should return 404 for non-existent template variant', async () => {
      const updateBody = { body: 'Updated body' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/99999').body(updateBody);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_VRT_001' });
    });

    it('should return 404 when variant exists but group does not match', async () => {
      const updateBody = { body: 'Updated body' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/2/variants/1').body(updateBody);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_VRT_001' });
    });

    it('should return 422 for empty update body', async () => {
      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/1').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid group ID format', async () => {
      const updateBody = { body: 'Updated body' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/invalid-id/variants/1').body(updateBody);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid variant ID format', async () => {
      const updateBody = { body: 'Updated body' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/invalid-id').body(updateBody);

      expect(response.statusCode).toBe(422);
    });

    it('should not allow updating channel', async () => {
      const updateBody = { channel: 'SMS' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/1').body(updateBody);

      expect(response.statusCode).toBe(422);
    });

    it('should not allow updating locale', async () => {
      const updateBody = { locale: 'fr-FR' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1/variants/1').body(updateBody);

      expect(response.statusCode).toBe(422);
    });
  });

  describe('DELETE /v1/template-groups/:groupId/variants/:variantId', () => {
    it('should delete a template variant', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/template-groups/1/variants/1');

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const getResponse = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants/1');
      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent template variant', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/template-groups/1/variants/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_VRT_001' });
    });

    it('should return 404 when variant exists but group does not match', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/template-groups/2/variants/1');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_VRT_001' });
    });

    it('should return 422 for invalid group ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/template-groups/invalid-id/variants/1');

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid variant ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/template-groups/1/variants/invalid-id');

      expect(response.statusCode).toBe(422);
    });

    it('should delete SMS template variant', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/template-groups/1/variants/2');

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const getResponse = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1/variants/2');
      expect(getResponse.statusCode).toBe(404);
    });
  });
});
