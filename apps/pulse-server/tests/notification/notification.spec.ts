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
const testEnv = new TestEnvironment('shadow_pulse_notification_test');

describe('Notification', () => {
  testEnv.init();

  describe('POST /v1/notifications', () => {
    it('should create notifications for all enabled channels with valid recipients', async () => {
      const body = {
        templateKey: 'sign-up',
        recipients: { email: 'user@example.com', phone: '+919876543210' },
        payload: { name: 'John Doe' },
        locale: 'en-US',
        service: 'default',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        status: 'ACCEPTED',
        channelResults: [
          { channel: 'EMAIL', status: 'QUEUED', locale: 'en-US', jobId: expect.stringMatching(TEST_REGEX.uuid) },
          { channel: 'SMS', status: 'QUEUED', locale: 'en-US', jobId: expect.stringMatching(TEST_REGEX.uuid) },
        ],
      });
    });

    it('should return PARTIAL_ACCEPTED when some channels succeed and others fail', async () => {
      const body = {
        templateKey: 'sign-up',
        recipients: { email: 'valid@example.com', phone: 'invalid' },
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        status: 'PARTIAL_ACCEPTED',
        channelResults: [
          { channel: 'EMAIL', status: 'QUEUED', locale: 'en-ZZ', jobId: expect.stringMatching(TEST_REGEX.uuid) },
          { channel: 'SMS', status: 'FAILED', error: expect.objectContaining({ code: 'NTF_001' }) },
        ],
      });
    });

    it('should return FAILED when all channels fail due to invalid or missing recipients', async () => {
      const body = {
        templateKey: 'sign-up',
        recipients: { email: 'invalid-email', phone: 'invalid-phone' },
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        status: 'FAILED',
        channelResults: [
          { channel: 'EMAIL', status: 'FAILED', error: expect.objectContaining({ code: 'NTF_002' }) },
          { channel: 'SMS', status: 'FAILED', error: expect.objectContaining({ code: 'NTF_001' }) },
        ],
      });
    });

    it('should return 404 for non-existent template key', async () => {
      const body = {
        templateKey: 'non-existent-template',
        recipients: { email: 'test@example.com' },
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_GRP_001' });
    });

    it('should return ACCEPTED with empty results for template with no enabled channels - spring-promo', async () => {
      const body = {
        templateKey: 'spring-promo',
        recipients: { email: 'promo@example.com' },
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({ status: 'ACCEPTED', channelResults: [] });
    });

    it('should fallback to en-ZZ locale when requested locale variant does not exist', async () => {
      const body = {
        templateKey: 'sign-up',
        recipients: { email: 'fallback@example.com', phone: '+15559876543' },
        locale: 'ja-JP',
      };

      const response = await testEnv.getRouter().mockRequest().post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({
        status: 'ACCEPTED',
        channelResults: [
          { channel: 'EMAIL', status: 'QUEUED', locale: 'en-ZZ', jobId: expect.stringMatching(TEST_REGEX.uuid) },
          { channel: 'SMS', status: 'QUEUED', locale: 'en-ZZ', jobId: expect.stringMatching(TEST_REGEX.uuid) },
        ],
      });
    });
  });
});
