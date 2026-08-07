import { describe, expect, it } from 'bun:test';

import { TEST_REGEX, TestEnvironment } from '@tests/test-environment';

const testEnv = new TestEnvironment('notification_test');

const byChannel = (results: { channel: string }[]): { channel: string }[] => [...results].sort((a, b) => a.channel.localeCompare(b.channel));

describe('Notification', () => {
  testEnv.init();

  describe('POST /v1/notifications', () => {
    it('should queue every enabled channel with a valid recipient, resolving the en-ZZ published content', async () => {
      const body = {
        templateKey: 'sign-up',
        recipients: { email: 'user@example.com', phone: '+919876543210' },
        payload: { name: 'John Doe' },
        locale: 'en-US',
        service: 'default',
      };

      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.status).toBe('ACCEPTED');
      expect(byChannel(json.channelResults)).toStrictEqual([
        { channel: 'EMAIL', status: 'QUEUED', locale: 'en-ZZ', jobId: expect.stringMatching(TEST_REGEX.uuid) },
        { channel: 'SMS', status: 'QUEUED', locale: 'en-ZZ', jobId: expect.stringMatching(TEST_REGEX.uuid) },
      ]);
    });

    it('should return PARTIAL_ACCEPTED when one channel succeeds and another has an invalid recipient', async () => {
      const body = { templateKey: 'sign-up', recipients: { email: 'valid@example.com', phone: 'invalid' }, payload: { name: 'Ada' } };

      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.status).toBe('PARTIAL_ACCEPTED');
      expect(byChannel(json.channelResults)).toStrictEqual([
        { channel: 'EMAIL', status: 'QUEUED', locale: 'en-ZZ', jobId: expect.stringMatching(TEST_REGEX.uuid) },
        { channel: 'SMS', status: 'FAILED', error: expect.objectContaining({ code: 'NTF_001' }) },
      ]);
    });

    it('should return FAILED when every channel has an invalid or missing recipient', async () => {
      const body = { templateKey: 'sign-up', recipients: { email: 'invalid-email', phone: 'invalid-phone' }, payload: { name: 'Ada' } };

      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.status).toBe('FAILED');
      expect(byChannel(json.channelResults)).toStrictEqual([
        { channel: 'EMAIL', status: 'FAILED', error: expect.objectContaining({ code: 'NTF_002' }) },
        { channel: 'SMS', status: 'FAILED', error: expect.objectContaining({ code: 'NTF_001' }) },
      ]);
    });

    it('should return 404 for a non-existent template key', async () => {
      const body = { templateKey: 'non-existent-template', recipients: { email: 'test@example.com' } };

      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'TPL_001' });
    });

    it('should return ACCEPTED with no channel results for an inactive template', async () => {
      const body = { templateKey: 'spring-promo', recipients: { email: 'promo@example.com' }, payload: { offer: 'SPRING50' } };

      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toStrictEqual({ status: 'ACCEPTED', channelResults: [] });
    });

    it('should return 400 NTF_004 when the payload omits a required template variable', async () => {
      const body = { templateKey: 'password-reset', recipients: { email: 'reset@example.com' } };

      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'NTF_004' });
    });
  });

  describe('GET /v1/notifications/messages', () => {
    it('should return all seeded notification messages', async () => {
      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get('/api/v1/notifications/messages');

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(3);
      expect(json.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(TEST_REGEX.id),
            channel: expect.stringMatching(/(EMAIL|SMS|PUSH)/),
            recipient: expect.any(String),
            renderedBody: expect.any(String),
            templateKey: expect.any(String),
            messageType: expect.stringMatching(/(TRANSACTIONAL|PROMOTIONAL|OTP)/),
            createdAt: expect.stringMatching(TEST_REGEX.dateISO),
          }),
        ]),
      );
    });

    it('should filter notification messages by channel', async () => {
      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get('/api/v1/notifications/messages?channel=SMS');

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.items[0]).toMatchObject({
        channel: 'SMS',
        recipient: '+15551230001',
        templateKey: 'sign-up',
        messageType: 'TRANSACTIONAL',
        renderedBody: 'Welcome Alice, your account is ready.',
      });
    });

    it('should filter notification messages by recipient', async () => {
      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get('/api/v1/notifications/messages?recipient=alice@example.com');

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.items[0]).toMatchObject({
        channel: 'EMAIL',
        recipient: 'alice@example.com',
        renderedSubject: 'Welcome to Shadow',
        renderedBody: 'Hi Alice, welcome aboard!',
        templateKey: 'sign-up',
        messageType: 'TRANSACTIONAL',
        payload: { name: 'Alice' },
      });
    });
  });
});
