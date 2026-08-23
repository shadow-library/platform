import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationService } from '@server/modules/system/application';
import { AuthModeService } from '@server/modules/system/auth-mode';

import { installUpstreamIdP } from '../auth/upstream-idp';
import { csrfPair, TestEnvironment } from '../test-environment';

const env = new TestEnvironment('admin-auth-mode').init();
const upstream = installUpstreamIdP({ issuer: 'https://accounts.google.example', clientId: 'google-client-id' });

afterAll(() => upstream.restore());

const GOOGLE_BODY = { kind: 'GOOGLE', name: 'Google', issuer: upstream.issuer, clientId: upstream.clientId, clientSecret: 'google-client-secret' };

describe('Admin auth mode APIs', () => {
  let adminSecret: string;
  let plainSecret: string;

  const request = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, cookie = adminSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  beforeEach(async () => {
    await env.getService(AuthModeService).invalidate();
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');

    const admin = await env.getService(UserService).createUserWithPassword({ email: 'mode-admin@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, String(organisation?.id));
    adminSecret = (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' })).secret;

    const plain = await env.getService(UserService).createUserWithPassword({ email: 'mode-plain@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    plainSecret = (await env.getService(SessionService).create({ userId: plain.id, aal: 'AAL2' })).secret;
  });

  describe('GET /api/v1/admin/auth-modes', () => {
    it('should list every method with its registry default and configuration state', async () => {
      const response = await request('get', '/api/v1/admin/auth-modes');

      expect(response.statusCode).toBe(200);
      const items = response.json().items as { method: string; enabled: boolean; configured: boolean; kind: string }[];
      expect(items.map(item => item.method)).toStrictEqual(['PASSWORD', 'WEBAUTHN', 'EMAIL_OTP', 'SMS_OTP', 'GOOGLE', 'MICROSOFT', 'APPLE']);
      expect(items.find(item => item.method === 'PASSWORD')).toMatchObject({ enabled: true, configured: true, kind: 'BUILT_IN' });
      expect(items.find(item => item.method === 'SMS_OTP')).toMatchObject({ enabled: false, configured: true });
      expect(items.find(item => item.method === 'GOOGLE')).toMatchObject({ enabled: false, configured: false, kind: 'SOCIAL' });
    });

    it('should refuse a caller without the platform admin role', async () => {
      const response = await request('get', '/api/v1/admin/auth-modes', plainSecret);

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/v1/admin/auth-modes/:method', () => {
    it('should turn a built-in method on and report it back as enabled', async () => {
      const response = await request('put', '/api/v1/admin/auth-modes/SMS_OTP').body({ enabled: true });

      expect(response.statusCode).toBe(200);
      const listed = (await request('get', '/api/v1/admin/auth-modes')).json().items as { method: string; enabled: boolean }[];
      expect(listed.find(item => item.method === 'SMS_OTP')?.enabled).toBe(true);
    });

    it('should refuse to enable a social method that has no settings yet', async () => {
      const response = await request('put', '/api/v1/admin/auth-modes/GOOGLE').body({ enabled: true });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'FED_004' });
    });

    it('should reject an unknown method', async () => {
      const response = await request('put', '/api/v1/admin/auth-modes/CARRIER_PIGEON').body({ enabled: true });

      expect(response.statusCode).toBe(422);
    });

    it('should refuse a caller without the platform admin role', async () => {
      const response = await request('put', '/api/v1/admin/auth-modes/SMS_OTP', plainSecret).body({ enabled: true });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('/api/v1/admin/identity-providers', () => {
    it('should configure a social provider without ever echoing its secret back', async () => {
      const response = await request('post', '/api/v1/admin/identity-providers').body(GOOGLE_BODY);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ kind: 'GOOGLE', clientId: upstream.clientId, allowSignUp: true, isActive: true });
      expect(JSON.stringify(response.json())).not.toContain('google-client-secret');
    });

    it('should let a configured social method then be enabled and disabled', async () => {
      await request('post', '/api/v1/admin/identity-providers').body(GOOGLE_BODY);

      const disabled = await request('put', '/api/v1/admin/auth-modes/GOOGLE').body({ enabled: false });
      expect(disabled.statusCode).toBe(200);
      const afterDisable = (await request('get', '/api/v1/admin/auth-modes')).json().items as { method: string; enabled: boolean; configured: boolean }[];
      expect(afterDisable.find(item => item.method === 'GOOGLE')).toMatchObject({ enabled: false, configured: true });

      await request('put', '/api/v1/admin/auth-modes/GOOGLE').body({ enabled: true });
      const afterEnable = (await request('get', '/api/v1/admin/auth-modes')).json().items as { method: string; enabled: boolean }[];
      expect(afterEnable.find(item => item.method === 'GOOGLE')?.enabled).toBe(true);
    });

    it('should reject a second provider of the same kind', async () => {
      await request('post', '/api/v1/admin/identity-providers').body(GOOGLE_BODY);

      const response = await request('post', '/api/v1/admin/identity-providers').body({ ...GOOGLE_BODY, name: 'Google Again' });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'FED_003' });
    });

    it('should reject a multi-tenant microsoft issuer', async () => {
      const response = await request('post', '/api/v1/admin/identity-providers').body({
        kind: 'MICROSOFT',
        name: 'Microsoft',
        issuer: 'https://login.microsoftonline.com/common/v2.0',
        clientId: 'entra-client-id',
        clientSecret: 'entra-secret',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'FED_005' });
    });

    it('should keep the stored secret when an update omits it', async () => {
      const created = (await request('post', '/api/v1/admin/identity-providers').body(GOOGLE_BODY)).json() as { id: string };

      const response = await request('patch', `/api/v1/admin/identity-providers/${created.id}`).body({ name: 'Google Workspace', allowSignUp: false });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ name: 'Google Workspace', allowSignUp: false });
    });

    it('should remove a configured provider and return the method to unconfigured', async () => {
      const created = (await request('post', '/api/v1/admin/identity-providers').body(GOOGLE_BODY)).json() as { id: string };

      const response = await request('delete', `/api/v1/admin/identity-providers/${created.id}`);

      expect(response.statusCode).toBe(200);
      const listed = (await request('get', '/api/v1/admin/auth-modes')).json().items as { method: string; configured: boolean }[];
      expect(listed.find(item => item.method === 'GOOGLE')?.configured).toBe(false);
    });

    it('should refuse a caller without the platform admin role', async () => {
      const response = await request('post', '/api/v1/admin/identity-providers', plainSecret).body(GOOGLE_BODY);

      expect(response.statusCode).toBe(403);
    });
  });
});
