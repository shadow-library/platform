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
const testEnv = new TestEnvironment('template_group_test');

describe('Template Group', () => {
  testEnv.init();

  describe('POST /v1/template-groups', () => {
    it('should create a template group', async () => {
      const body = {
        templateKey: 'test-template-key',
        messageType: 'OTP',
        description: 'Test Template Group',
        priority: 'LOW',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        id: expect.stringMatching(TEST_REGEX.id),
        ...body,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 409 conflict when template key already exists', async () => {
      const body = {
        templateKey: 'sign-up',
        messageType: 'OTP',
        description: 'First Template Group',
        priority: 'LOW',
        isActive: true,
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups').body(body);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'TPL_GRP_002' });
    });

    it('should return 422 for invalid message type', async () => {
      const body = {
        templateKey: 'test-template-key',
        messageType: 'INVALID_TYPE',
        description: 'Test Template Group',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/template-groups').body(body);

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /v1/template-groups', () => {
    it('should list all template groups', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 5,
        limit: 20,
        offset: 0,
        items: expect.arrayContaining([
          {
            id: expect.stringMatching(TEST_REGEX.id),
            templateKey: expect.any(String),
            messageType: expect.any(String),
            description: expect.any(String),
            priority: expect.any(String),
            isActive: expect.any(Boolean),
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          },
        ]),
      });
    });

    it('should filter template groups by key', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups?key=reset');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '2',
            templateKey: 'password-reset',
            messageType: 'TRANSACTIONAL',
            description: 'Templates for password reset notifications',
            priority: 'HIGH',
            isActive: true,
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
            updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
          },
        ],
      });
    });
  });

  describe('GET /v1/template-groups/:groupId', () => {
    it('should get a template group by ID', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/1');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        templateKey: 'sign-up',
        messageType: 'TRANSACTIONAL',
        description: 'Templates for user sign-up notifications',
        priority: 'MEDIUM',
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 404 for non-existent template group', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/99999');

      expect(response.statusCode).toBe(404);
    });

    it('should return 422 for invalid group ID format', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/template-groups/invalid-id');

      expect(response.statusCode).toBe(422);
    });
  });

  describe('PATCH /v1/template-groups/:groupId', () => {
    it('should update a template group', async () => {
      const updateBody = {
        description: 'Updated Description',
        priority: 'HIGH',
        isActive: false,
      };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/1').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '1',
        templateKey: 'sign-up',
        messageType: 'TRANSACTIONAL',
        ...updateBody,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should partially update a template group', async () => {
      const updateBody = { description: 'Only Update Description' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/2').body(updateBody);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        id: '2',
        templateKey: 'password-reset',
        messageType: 'TRANSACTIONAL',
        description: updateBody.description,
        priority: 'HIGH',
        isActive: true,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        updatedAt: expect.stringMatching(TEST_REGEX.dateISO),
      });
    });

    it('should return 404 for non-existent template group', async () => {
      const updateBody = { description: 'Updated Description' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/99999').body(updateBody);

      expect(response.statusCode).toBe(404);
    });

    it('should return 422 for empty update body', async () => {
      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/3').body({});

      expect(response.statusCode).toBe(422);
    });

    it('should return 422 for invalid priority in update', async () => {
      const updateBody = { priority: 'INVALID_PRIORITY' };

      const response = await testEnv.getRouter().mockRequest().patch('/api/v1/template-groups/4').body(updateBody);

      expect(response.statusCode).toBe(422);
    });
  });
});
