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
const testEnv = new TestEnvironment('sender_endpoint_test');

describe('Sender Endpoint', () => {
  testEnv.init();

  describe('POST /v1/sender-profiles/:profileId/endpoints', () => {
    it('should create a sender endpoint with all fields', async () => {
      const body = {
        channel: 'EMAIL',
        provider: 'AWS_SES',
        identifier: 'new-endpoint@shadow.test',
        weight: 5,
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        senderProfileId: '1',
        channel: body.channel,
        provider: body.provider,
        identifier: body.identifier,
        weight: body.weight,
        isActive: body.isActive,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a sender endpoint with only required fields', async () => {
      const body = {
        channel: 'SMS',
        provider: 'TWILIO',
        identifier: '+15559990001',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/2/endpoints').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        senderProfileId: '2',
        channel: body.channel,
        provider: body.provider,
        identifier: body.identifier,
        weight: 1,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should create a sender endpoint with isActive set to false', async () => {
      const body = {
        channel: 'PUSH',
        provider: 'FIREBASE',
        identifier: 'inactive-firebase-app',
        isActive: false,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/3/endpoints').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        channel: body.channel,
        provider: body.provider,
        identifier: body.identifier,
        isActive: false,
      });
    });

    it('should return 404 when sender profile does not exist', async () => {
      const body = {
        channel: 'EMAIL',
        provider: 'SENDGRID',
        identifier: 'test@shadow.test',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/99999/endpoints').body(body);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_001' });
    });

    it('should return 409 conflict when endpoint with same channel, provider, and identifier already exists', async () => {
      const body = {
        channel: 'EMAIL',
        provider: 'SENDGRID',
        identifier: 'marketing@shadow.test',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body(body);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SND_EP_002' });
    });

    it('should return 422 when channel field is missing', async () => {
      const body = {
        provider: 'SENDGRID',
        identifier: 'test@shadow.test',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 when provider field is missing', async () => {
      const body = {
        channel: 'EMAIL',
        identifier: 'test@shadow.test',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 when identifier field is missing', async () => {
      const body = {
        channel: 'EMAIL',
        provider: 'SENDGRID',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 when body is empty', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid profile ID format', async () => {
      const body = {
        channel: 'EMAIL',
        provider: 'SENDGRID',
        identifier: 'test@shadow.test',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/invalid-id/endpoints').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid channel value', async () => {
      const body = {
        channel: 'INVALID_CHANNEL',
        provider: 'SENDGRID',
        identifier: 'test@shadow.test',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body(body);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid provider value', async () => {
      const body = {
        channel: 'EMAIL',
        provider: 'INVALID_PROVIDER',
        identifier: 'test@shadow.test',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/sender-profiles/1/endpoints').body(body);

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /v1/sender-profiles/:profileId/endpoints', () => {
    it('should list all sender endpoints for a profile', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 4,
        limit: 20,
        offset: 0,
        items: expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(TEST_REGEX.id),
            senderProfileId: '1',
            channel: expect.any(String),
            provider: expect.any(String),
            identifier: expect.any(String),
            weight: expect.any(Number),
            isActive: expect.any(Boolean),
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          }),
        ]),
      });
    });

    it('should return all sender endpoints for profile 1', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?sortBy=createdAt&sortOrder=asc');

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(4);
      expect(json.items).toHaveLength(4);
      expect(json.items.map((item: { channel: string }) => item.channel)).toEqual(['EMAIL', 'EMAIL', 'SMS', 'PUSH']);
    });

    it('should filter sender endpoints by channel EMAIL', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?channel=EMAIL');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 2,
        items: expect.arrayContaining([expect.objectContaining({ channel: 'EMAIL', provider: 'SENDGRID' }), expect.objectContaining({ channel: 'EMAIL', provider: 'AWS_SES' })]),
      });
    });

    it('should filter sender endpoints by channel SMS', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?channel=SMS');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ channel: 'SMS', provider: 'TWILIO' })],
      });
    });

    it('should filter sender endpoints by channel PUSH', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?channel=PUSH');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ channel: 'PUSH', provider: 'FIREBASE' })],
      });
    });

    it('should filter sender endpoints by provider SENDGRID', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?provider=SENDGRID');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ provider: 'SENDGRID', channel: 'EMAIL' })],
      });
    });

    it('should filter sender endpoints by provider AWS_SES', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?provider=AWS_SES');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ provider: 'AWS_SES', channel: 'EMAIL' })],
      });
    });

    it('should filter sender endpoints by provider TWILIO', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?provider=TWILIO');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ provider: 'TWILIO', channel: 'SMS' })],
      });
    });

    it('should filter sender endpoints by provider FIREBASE', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?provider=FIREBASE');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ provider: 'FIREBASE', channel: 'PUSH' })],
      });
    });

    it('should filter sender endpoints by isActive true', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?isActive=true');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 3,
        items: expect.arrayContaining([
          expect.objectContaining({ isActive: true, channel: 'EMAIL', provider: 'SENDGRID' }),
          expect.objectContaining({ isActive: true, channel: 'EMAIL', provider: 'AWS_SES' }),
          expect.objectContaining({ isActive: true, channel: 'SMS', provider: 'TWILIO' }),
        ]),
      });
    });

    it('should filter sender endpoints by isActive false', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?isActive=false');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ isActive: false, channel: 'PUSH', provider: 'FIREBASE' })],
      });
    });

    it('should combine multiple filters', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?channel=EMAIL&isActive=true');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 2,
        items: expect.arrayContaining([expect.objectContaining({ channel: 'EMAIL', isActive: true }), expect.objectContaining({ channel: 'EMAIL', isActive: true })]),
      });
    });

    it('should return empty list when no endpoints match filter', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?channel=SMS&isActive=false');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 0,
        limit: 20,
        offset: 0,
        items: [],
      });
    });

    it('should support pagination with limit', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?limit=2&offset=0');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 4,
        limit: 2,
        offset: 0,
      });
      expect(response.json().items).toHaveLength(2);
    });

    it('should support pagination with offset', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints?limit=2&offset=2');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 4,
        limit: 2,
        offset: 2,
      });
      expect(response.json().items).toHaveLength(2);
    });

    it('should return 404 when sender profile does not exist', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/99999/endpoints');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_PRF_001' });
    });

    it('should return 422 for invalid profile ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/invalid-id/endpoints');

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /v1/sender-profiles/:profileId/endpoints/:endpointId', () => {
    it('should get a sender endpoint by ID', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints/1');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        senderProfileId: '1',
        channel: 'EMAIL',
        provider: 'SENDGRID',
        identifier: 'marketing@shadow.test',
        weight: 1,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should get sender endpoint for profile 2', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/2/endpoints/5');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '5',
        senderProfileId: '2',
        channel: 'EMAIL',
        provider: 'AWS_SES',
        identifier: 'noreply@shadow.test',
        weight: 1,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should get SMS endpoint', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/3/endpoints/6');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '6',
        senderProfileId: '3',
        channel: 'SMS',
        provider: 'TWILIO',
        identifier: '+15551230001',
        weight: 1,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should get PUSH endpoint', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/5/endpoints/8');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '8',
        senderProfileId: '5',
        channel: 'PUSH',
        provider: 'FIREBASE',
        identifier: 'firebase-app-main',
        weight: 1,
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 404 for non-existent sender endpoint', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_EP_001' });
    });

    it('should return 404 when endpoint does not belong to profile', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints/5');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_EP_001' });
    });

    it('should return 422 for invalid profile ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/invalid-id/endpoints/1');

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid endpoint ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints/invalid-id');

      expect(response.statusCode).toBe(422);
    });
  });

  describe('PATCH /v1/sender-profiles/:profileId/endpoints/:endpointId', () => {
    it('should update a sender endpoint with all updatable fields', async () => {
      const updateBody = {
        identifier: 'updated-marketing@shadow.test',
        weight: 10,
        isActive: false,
      };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1/endpoints/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        senderProfileId: '1',
        channel: 'EMAIL',
        provider: 'SENDGRID',
        identifier: updateBody.identifier,
        weight: updateBody.weight,
        isActive: updateBody.isActive,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should partially update only identifier', async () => {
      const updateBody = { identifier: 'new-identifier@shadow.test' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/2/endpoints/5').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '5',
        identifier: updateBody.identifier,
        channel: 'EMAIL',
        provider: 'AWS_SES',
      });
    });

    it('should partially update only weight', async () => {
      const updateBody = { weight: 5 };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/3/endpoints/6').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '6',
        weight: 5,
      });
    });

    it('should partially update only isActive', async () => {
      const updateBody = { isActive: false };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/4/endpoints/7').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '7',
        isActive: false,
      });
    });

    it('should return 404 for non-existent sender endpoint', async () => {
      const updateBody = { identifier: 'updated@shadow.test' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1/endpoints/99999').body(updateBody);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_EP_001' });
    });

    it('should return 404 when endpoint does not belong to profile', async () => {
      const updateBody = { identifier: 'updated@shadow.test' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1/endpoints/5').body(updateBody);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_EP_001' });
    });

    it('should return 422 for empty update body', async () => {
      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1/endpoints/1').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid profile ID format', async () => {
      const updateBody = { identifier: 'updated@shadow.test' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/invalid-id/endpoints/1').body(updateBody);

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid endpoint ID format', async () => {
      const updateBody = { identifier: 'updated@shadow.test' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1/endpoints/invalid-id').body(updateBody);

      expect(response.statusCode).toBe(422);
    });

    it('should ignore channel field in update body', async () => {
      const updateBody = { channel: 'SMS', identifier: 'updated-with-channel@shadow.test' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1/endpoints/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '1',
        channel: 'EMAIL',
        identifier: 'updated-with-channel@shadow.test',
      });
    });

    it('should ignore provider field in update body', async () => {
      const updateBody = { provider: 'TWILIO', identifier: 'updated-with-provider@shadow.test' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/sender-profiles/1/endpoints/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: '1',
        provider: 'SENDGRID',
        identifier: 'updated-with-provider@shadow.test',
      });
    });
  });

  describe('DELETE /v1/sender-profiles/:profileId/endpoints/:endpointId', () => {
    it('should delete a sender endpoint', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/1/endpoints/1');

      expect(response.statusCode).toBe(204);

      const getResponse = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/1/endpoints/1');
      expect(getResponse.statusCode).toBe(404);
    });

    it('should delete SMS endpoint', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/3/endpoints/6');

      expect(response.statusCode).toBe(204);

      const getResponse = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/3/endpoints/6');
      expect(getResponse.statusCode).toBe(404);
    });

    it('should delete PUSH endpoint', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/5/endpoints/8');

      expect(response.statusCode).toBe(204);

      const getResponse = await testEnv.getRouter().mockRequest().get('/api/v1/sender-profiles/5/endpoints/8');
      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent sender endpoint', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/1/endpoints/99999');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_EP_001' });
    });

    it('should return 404 when endpoint does not belong to profile', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/1/endpoints/5');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SND_EP_001' });
    });

    it('should return 422 for invalid profile ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/invalid-id/endpoints/1');

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid endpoint ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().delete('/api/v1/sender-profiles/1/endpoints/invalid-id');

      expect(response.statusCode).toBe(422);
    });
  });
});
