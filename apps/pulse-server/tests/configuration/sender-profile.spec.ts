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
const testEnv = new TestEnvironment('shadow_pulse_sender_profile_test');

describe('Sender Profile', () => {
  testEnv.init();

  describe('POST /v1/sender-profiles', () => {
    it('should create a sender profile with all fields', async () => {
      const body = {
        key: 'new-profile',
        displayName: 'New Profile',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        key: body.key,
        displayName: body.displayName,
        isActive: body.isActive,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a sender profile with only required key field', async () => {
      const body = { key: 'minimal-profile' };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        key: body.key,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a sender profile with isActive set to false', async () => {
      const body = {
        key: 'inactive-profile',
        displayName: 'Inactive Profile',
        isActive: false,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        key: body.key,
        displayName: body.displayName,
        isActive: false,
      });
    });

    it('should return 409 conflict when profile key already exists', async () => {
      const body = {
        key: 'marketing-default',
        displayName: 'Duplicate Profile',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles').body(body);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_002' });
    });

    it('should return 422 when key field is missing', async () => {
      const body = { displayName: 'No Key Profile', isActive: true };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 when body is empty', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should create default routing rule when first sender profile is created', async () => {
      const db = testEnv.getPrimaryDatabase();

      await db.delete(db._.fullSchema.senderRoutingRules);
      await db.delete(db._.fullSchema.senderProfiles);

      const body = {
        key: 'first-profile',
        displayName: 'First Profile',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles').body(body);
      expect(response.statusCode).toBe(201);

      const profileId = BigInt(response.json().id);

      const routingRules = await db.query.senderRoutingRules.findMany({ where: (rules, { eq }) => eq(rules.senderProfileId, profileId) });
      expect(routingRules).toHaveLength(1);
      expect(routingRules[0]).toMatchObject({
        senderProfileId: profileId,
        service: null,
        region: null,
        messageType: null,
      });
    });
  });

  describe('GET /v1/sender-profiles', () => {
    it('should list all sender profiles', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 5,
        limit: 20,
        offset: 0,
        items: expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(TEST_REGEX.id),
            key: expect.any(String),
            isActive: expect.any(Boolean),
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          }),
        ]),
      });
    });

    it('should filter sender profiles by key', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles?key=marketing');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '1',
            key: 'marketing-default',
            displayName: 'Marketing Default',
            isActive: true,
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          },
        ],
      });
    });

    it('should filter sender profiles by partial key match', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles?key=core');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ key: 'transactional-core' })],
      });
    });

    it('should filter sender profiles by isActive', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles?isActive=false');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ isActive: false })],
      });
    });

    it('should return empty list when no profiles match filter', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles?key=nonexistent');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 0,
        limit: 20,
        offset: 0,
        items: [],
      });
    });

    it('should support pagination', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles?limit=2&offset=0');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 5,
        limit: 2,
        offset: 0,
      });
      expect(response.json().items).toHaveLength(2);
    });

    it('should support pagination with offset', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles?limit=2&offset=2');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 5,
        limit: 2,
        offset: 2,
      });
      expect(response.json().items).toHaveLength(2);
    });
  });

  describe('GET /v1/sender-profiles/:profileId', () => {
    it('should get a sender profile by ID', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        key: 'marketing-default',
        displayName: 'Marketing Default',
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should get sender profile without displayName', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/4');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '4',
        key: 'otp-shortcodes',
        isActive: false,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 404 for non-existent sender profile', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_001' });
    });

    it('should return 422 for invalid profile ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/invalid-id');

      expect(response.statusCode).toBe(422);
    });
  });

  describe('PATCH /v1/sender-profiles/:profileId', () => {
    it('should update a sender profile', async () => {
      const updateBody = {
        displayName: 'Updated Marketing Profile',
        isActive: false,
      };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        key: 'marketing-default',
        displayName: updateBody.displayName,
        isActive: updateBody.isActive,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should partially update only displayName', async () => {
      const updateBody = { displayName: 'New Display Name' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/2').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '2',
        key: 'transactional-core',
        displayName: updateBody.displayName,
        isActive: true,
      });
    });

    it('should partially update only isActive', async () => {
      const updateBody = { isActive: false };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/3').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '3',
        isActive: false,
      });
    });

    it('should return 404 for non-existent sender profile', async () => {
      const updateBody = { displayName: 'Updated Name' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/99999').body(updateBody);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_001' });
    });

    it('should return 422 for empty update body', async () => {
      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid profile ID format', async () => {
      const updateBody = { displayName: 'Updated Name' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/invalid-id').body(updateBody);

      expect(response.statusCode).toBe(422);
    });

    it('should ignore key field in update body', async () => {
      const updateBody = { key: 'new-key', displayName: 'Updated With Key' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/5').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '5',
        key: 'system-service',
        displayName: 'Updated With Key',
      });
    });
  });

  describe('DELETE /v1/sender-profiles/:profileId', () => {
    it('should delete a sender profile without routing rules', async () => {
      const db = testEnv.getPrimaryDatabase();
      await db.delete(db._.fullSchema.senderRoutingRules);

      const response = await testEnv.getRouter().mockRequest().delete(`/api/v1/sender-profiles/1`);

      expect(response.statusCode).toBe(204);

      const getResponse = await testEnv.getRouter().mockRequest().get(`/api/v1/sender-profiles/1`);
      expect(getResponse.statusCode).toBe(404);
    });

    it('should fail when deleting profile with active routing rules', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/2');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_003' });
    });

    it('should return 404 for non-existent sender profile', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_001' });
    });

    it('should return 422 for invalid profile ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/invalid-id');

      expect(response.statusCode).toBe(422);
    });
  });
});
