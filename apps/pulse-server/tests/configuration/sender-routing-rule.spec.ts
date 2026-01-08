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
const testEnv = new TestEnvironment('shadow_pulse_sender_routing_rule_test');

describe('Sender Routing Rule', () => {
  testEnv.init();

  describe('POST /v1/sender-routing-rules', () => {
    it('should create a routing rule with all fields', async () => {
      const body = {
        senderProfileId: '1',
        service: 'new-service',
        region: 'AP',
        messageType: 'TRANSACTIONAL',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        senderProfileId: body.senderProfileId,
        service: body.service,
        region: body.region,
        messageType: body.messageType,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a routing rule with only required senderProfileId', async () => {
      const db = testEnv.getPrimaryDatabase();
      await db.delete(db._.fullSchema.senderRoutingRules);

      const body = { senderProfileId: '1' };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        senderProfileId: body.senderProfileId,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a routing rule with service only', async () => {
      const body = {
        senderProfileId: '2',
        service: 'billing',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        senderProfileId: body.senderProfileId,
        service: body.service,
      });
    });

    it('should create a routing rule with service and region', async () => {
      const body = {
        senderProfileId: '3',
        service: 'payments',
        region: 'EU',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        senderProfileId: body.senderProfileId,
        service: body.service,
        region: body.region,
      });
    });

    it('should create a routing rule with service and messageType', async () => {
      const body = {
        senderProfileId: '1',
        service: 'notifications',
        messageType: 'OTP',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        senderProfileId: body.senderProfileId,
        service: body.service,
        messageType: body.messageType,
      });
    });

    it('should return 404 when sender profile does not exist', async () => {
      const body = {
        senderProfileId: '99999',
        service: 'test-service',
        region: 'US',
        messageType: 'TRANSACTIONAL',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_001' });
    });

    it('should return 409 conflict when sender profile is inactive', async () => {
      const body = {
        senderProfileId: '4',
        service: 'otp-test',
        region: 'US',
        messageType: 'OTP',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SND_RTR_003' });
    });

    it('should return 409 conflict when routing rule with same service, region, and messageType already exists', async () => {
      const body = {
        senderProfileId: '1',
        service: 'auth',
        region: 'US',
        messageType: 'TRANSACTIONAL',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SND_RTR_002' });
    });

    it('should return 409 conflict when routing rule with same service exists (both region and messageType null)', async () => {
      const duplicateResponse = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body({
        senderProfileId: '2',
        service: 'marketing',
      });

      expect(duplicateResponse.statusCode).toBe(409);
      expect(duplicateResponse.json()).toMatchObject({ code: 'SND_RTR_002' });
    });

    it('should return 422 when senderProfileId is missing', async () => {
      const body = {
        service: 'test-service',
        region: 'US',
        messageType: 'TRANSACTIONAL',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 when body is empty', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid senderProfileId format', async () => {
      const body = {
        senderProfileId: 'invalid-id',
        service: 'test-service',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid messageType value', async () => {
      const body = {
        senderProfileId: '1',
        service: 'test-service',
        messageType: 'INVALID_TYPE',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /v1/sender-routing-rules', () => {
    it('should list all sender routing rules', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 6,
        limit: 20,
        offset: 0,
        items: expect.arrayContaining([
          expect.objectContaining({
            senderProfileId: expect.stringMatching(TEST_REGEX.id),
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          }),
        ]),
      });
    });

    it('should filter routing rules by messageType', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?messageType=TRANSACTIONAL');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 3,
        items: expect.arrayContaining([expect.objectContaining({ messageType: 'TRANSACTIONAL' })]),
      });
    });

    it('should filter routing rules by region', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?region=US');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 2,
        items: expect.arrayContaining([expect.objectContaining({ region: 'US' })]),
      });
    });

    it('should filter routing rules by serviceName', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?serviceName=auth');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ service: 'auth' })],
      });
    });

    it('should filter routing rules by multiple parameters', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?region=US&messageType=TRANSACTIONAL');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ region: 'US', messageType: 'TRANSACTIONAL', service: 'auth' })],
      });
    });

    it('should return empty list when no routing rules match filter', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?region=NONEXISTENT');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 0,
        limit: 20,
        offset: 0,
        items: [],
      });
    });

    it('should paginate routing rules with limit', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?limit=2');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 6,
        limit: 2,
        offset: 0,
      });
      expect(response.json().items).toHaveLength(2);
    });

    it('should paginate routing rules with offset', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?limit=2&offset=2');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 6,
        limit: 2,
        offset: 2,
      });
      expect(response.json().items).toHaveLength(2);
    });

    it('should sort routing rules by createdAt ascending', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules?sortBy=createdAt&sortOrder=asc');

      expect(response.statusCode).toBe(200);
      const items = response.json().items;
      for (let i = 1; i < items.length; i++) {
        expect(new Date(items[i - 1].createdAt).getTime()).toBeLessThanOrEqual(new Date(items[i].createdAt).getTime());
      }
    });

    it('should sort routing rules by updatedAt descending by default', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules');

      expect(response.statusCode).toBe(200);
      const items = response.json().items;
      for (let i = 1; i < items.length; i++) {
        expect(new Date(items[i - 1].updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(items[i].updatedAt).getTime());
      }
    });
  });

  describe('GET /v1/sender-routing-rules/:routingRuleId', () => {
    it('should get a sender routing rule with profile details', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules/1');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        senderProfileId: '2',
        service: 'auth',
        region: 'US',
        messageType: 'TRANSACTIONAL',
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
        profile: {
          id: '2',
          key: 'transactional-core',
          displayName: 'Transactional Core',
          isActive: true,
          createdAt: expect.stringMatching(TEST_REGEX.dateISO),
          updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
        },
      });
    });

    it('should get routing rule with null optional fields', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules/6');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        senderProfileId: '1',
        profile: expect.objectContaining({ id: '1' }),
      });
      expect(response.json().service).toBeUndefined();
      expect(response.json().region).toBeUndefined();
      expect(response.json().messageType).toBeUndefined();
    });

    it('should return 404 when routing rule does not exist', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_RTR_001' });
    });

    it('should return 422 for invalid routing rule ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules/invalid-id');

      expect(response.statusCode).toBe(422);
    });
  });

  describe('PATCH /v1/sender-routing-rules/:routingRuleId', () => {
    it('should update a routing rule sender profile', async () => {
      const body = { senderProfileId: '3' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-routing-rules/1').body(body);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        senderProfileId: '3',
        service: 'auth',
        region: 'US',
        messageType: 'TRANSACTIONAL',
      });
    });

    it('should return 404 when routing rule does not exist', async () => {
      const body = { senderProfileId: '1' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-routing-rules/99999').body(body);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_RTR_001' });
    });

    it('should return 404 when target sender profile does not exist', async () => {
      const body = { senderProfileId: '99999' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-routing-rules/1').body(body);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_001' });
    });

    it('should return 409 conflict when target sender profile is inactive', async () => {
      const body = { senderProfileId: '4' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-routing-rules/1').body(body);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SND_RTR_003' });
    });

    it('should return 422 when senderProfileId is missing', async () => {
      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-routing-rules/1').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid routing rule ID format', async () => {
      const body = { senderProfileId: '1' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-routing-rules/invalid-id').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid senderProfileId format', async () => {
      const body = { senderProfileId: 'invalid-id' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-routing-rules/1').body(body);

      expect(response.statusCode).toBe(422);
    });
  });

  describe('DELETE /v1/sender-routing-rules/:routingRuleId', () => {
    it('should delete a sender routing rule', async () => {
      const deleteResponse = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-routing-rules/1');

      expect(deleteResponse.statusCode).toBe(204);

      const getResponse = await testEnv.getRouter().mockRequest().get('/api/v1/sender-routing-rules/1');
      expect(getResponse.statusCode).toBe(404);
    });

    it('should delete a routing rule with only service set', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-routing-rules/2');

      expect(response.statusCode).toBe(204);
    });

    it('should return 409 conflict when trying to delete default routing rule', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-routing-rules/6');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SND_RTR_004' });
    });

    it('should return 404 when routing rule does not exist', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-routing-rules/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_RTR_001' });
    });

    it('should return 422 for invalid routing rule ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-routing-rules/invalid-id');

      expect(response.statusCode).toBe(422);
    });

    it('should allow re-creation of deleted routing rule combination', async () => {
      // First, delete an existing routing rule
      const deleteResponse = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-routing-rules/1');
      expect(deleteResponse.statusCode).toBe(204);

      // Now create a new routing rule with the same combination
      const body = {
        senderProfileId: '1',
        service: 'auth',
        region: 'US',
        messageType: 'TRANSACTIONAL',
      };

      const createResponse = await testEnv.getRouter().mockRequest().post('/api/v1/sender-routing-rules').body(body);

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json()).toMatchObject({
        senderProfileId: body.senderProfileId,
        service: body.service,
        region: body.region,
        messageType: body.messageType,
      });
    });
  });
});
