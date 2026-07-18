/**
 * Importing npm packages
 */
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { FederatedFlowState } from '@server/modules/auth/flow';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { WebhookTargetGuard } from '@server/modules/infrastructure/webhook';
import { ApplicationService } from '@server/modules/system/application';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

type Json = Record<string, unknown>;

/**
 * Declaring the constants
 */
const env = new TestEnvironment('federation').init();
const DOMAIN = 'fed.example.com';
const UPSTREAM_CLIENT = { clientId: 'shadow-rp', clientSecret: 'upstream-secret' };

describe('Inbound OIDC federation', () => {
  let upstream: TestIdP;
  let orgId: bigint;

  const post = (path: string, body: Record<string, unknown>) => env.getRouter().mockRequest().post(`/api/v1/auth/${path}`).body(body);

  const flowState = async (flowId: string): Promise<{ federated: FederatedFlowState }> => {
    const raw = await env.getRedisClient().get(`auth_flow:${flowId}`);
    if (!raw) throw new Error('flow not found in redis');
    return JSON.parse(raw) as { federated: FederatedFlowState };
  };

  const configureProvider = async (enforced = false): Promise<void> => {
    const owner = await env
      .getService(UserService)
      .createUserWithPassword({ email: `owner-${Date.now()}@corp.test`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const organisation = await env.getService(OrganisationService).createTeam(owner.id, { name: `Fed Org ${Date.now()}` });
    orgId = organisation.id;
    await env
      .getPostgresClient()
      .insert(schema.organisationDomains)
      .values({ organisationId: organisation.id, domain: DOMAIN, verificationToken: 'token', status: 'VERIFIED', verifiedAt: new Date() });

    const secret = (await env.getService(SessionService).create({ userId: owner.id, aal: 'AAL2' })).secret;
    const csrf = csrfPair();
    const response = await env
      .getRouter()
      .mockRequest()
      .post(`/api/v1/organisations/${organisation.id}/identity-providers`)
      .headers({ 'x-csrf-token': csrf.header })
      .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie })
      .body({ name: 'Corp SSO', issuer: upstream.issuer, clientId: UPSTREAM_CLIENT.clientId, clientSecret: UPSTREAM_CLIENT.clientSecret, enforced });
    expect(response.statusCode).toBe(201);
  };

  /** Drives the browser's federated round-trip: init → upstream code → callback. */
  const federatedCallback = async (email: string, subject: string, options: { emailVerified?: boolean; breakNonce?: boolean } = {}) => {
    const init = await post('login/init', { identifier: email });
    expect(init.statusCode).toBe(200);
    const initBody = init.json() as Json;
    const flowId = String(initBody['flowId']);
    const { federated } = await flowState(flowId);

    const code = upstream.createAuthorizationCode({
      sub: subject,
      nonce: options.breakNonce ? 'wrong-nonce' : federated.nonce,
      claims: { email, email_verified: options.emailVerified ?? true },
    });
    const callback = await env
      .getRouter()
      .mockRequest()
      .get(`/api/v1/auth/federated/callback?state=${encodeURIComponent(flowId)}&code=${encodeURIComponent(code)}`);
    return { flowId, callback, initBody };
  };

  beforeEach(async () => {
    upstream = await createTestIdP(UPSTREAM_CLIENT);
    env.getService(WebhookTargetGuard).allowInsecureTargets = true;
    await configureProvider();
  });

  afterAll(() => upstream?.stop());

  it('should offer home-realm discovery for verified federated domains', async () => {
    const init = await post('login/init', { identifier: `person@${DOMAIN}` });
    const body = init.json() as Json;
    expect(body['status']).toBe('AWAITING_PASSWORD');
    const federated = body['federated'] as Json;
    expect(federated['enforced']).toBe(false);
    expect(String(federated['authorizationUrl'])).toContain(upstream.issuer);
    expect(String(federated['authorizationUrl'])).toContain(`state=${encodeURIComponent(String(body['flowId']))}`);

    const foreign = await post('login/init', { identifier: 'person@unfederated.example.com' });
    expect((foreign.json() as Json)['federated']).toBeUndefined();
  });

  it('should jit-provision a first-time federated user into the organisation', async () => {
    const email = `newhire@${DOMAIN}`;
    const { callback } = await federatedCallback(email, 'upstream-sub-1');

    expect(callback.statusCode).toBe(302);
    expect(String(callback.headers['location'])).toBe('/account');
    expect(String(callback.headers['set-cookie'] ?? '')).toContain('__Host-sid');

    const user = await env.getService(UserService).getUser(email);
    expect(user).not.toBeNull();
    expect(user?.status).toBe('ACTIVE');
    const membership = await env.getService(OrganisationService).getMembership(user?.id ?? 0n, orgId);
    expect(membership?.role).toBe('MEMBER');

    const returning = await federatedCallback(email, 'upstream-sub-1');
    expect(returning.callback.statusCode).toBe(302);
    expect(String(returning.callback.headers['location'])).toBe('/account');
    const identities = await env.getPostgresClient().select().from(schema.federatedIdentities);
    expect(identities.length).toBe(1);
  });

  it('should demand an email-otp proof before linking to an existing local account', async () => {
    const email = `veteran@${DOMAIN}`;
    const existing = await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });

    const { flowId, callback } = await federatedCallback(email, 'upstream-sub-2');
    expect(callback.statusCode).toBe(302);
    expect(String(callback.headers['location'])).toContain('status=AWAITING_LINK_OTP');
    expect(String(callback.headers['set-cookie'] ?? '')).not.toContain('__Host-sid');

    const rows = await env.getPostgresClient().select().from(schema.notificationOutbox);
    const otp = rows.find(entry => entry.recipients.email === email && entry.templateKey === 'auth.login.otp');
    const code = String((otp?.payload as { code: string }).code);

    const verify = await post('challenge/verify', { flowId, code });
    expect(verify.statusCode).toBe(200);
    expect((verify.json() as Json)['status']).toBe('COMPLETED');

    const identities = await env.getPostgresClient().select().from(schema.federatedIdentities);
    expect(identities).toHaveLength(1);
    expect(identities[0]?.userId).toBe(existing.id);
    expect((await env.getService(OrganisationService).getMembership(existing.id, orgId))?.role).toBe('MEMBER');
  });

  it('should fail neutrally on bad codes, wrong nonces and unverified emails', async () => {
    const bogus = await env.getRouter().mockRequest().get('/api/v1/auth/federated/callback?state=flow_auth_unknown&code=x');
    expect(String(bogus.headers['location'])).toContain('error=federation_failed');

    const wrongNonce = await federatedCallback(`nonce@${DOMAIN}`, 'upstream-sub-3', { breakNonce: true });
    expect(String(wrongNonce.callback.headers['location'])).toContain('error=federation_failed');

    const unverified = await federatedCallback(`unverified@${DOMAIN}`, 'upstream-sub-4', { emailVerified: false });
    expect(String(unverified.callback.headers['location'])).toContain('error=federation_failed');
    expect(await env.getService(UserService).getUser(`unverified@${DOMAIN}`)).toBeNull();
  });

  it('should enforce federation while leaving break-glass for platform admins', async () => {
    await env.getPostgresClient().delete(schema.identityProviders);
    await env.getPostgresClient().delete(schema.organisationDomains);
    await configureProvider(true);

    const init = await post('login/init', { identifier: `enforced@${DOMAIN}` });
    const body = init.json() as Json;
    expect(body['status']).toBe('AWAITING_FEDERATED');
    expect((body['federated'] as Json)['enforced']).toBe(true);

    const password = await post('challenge/verify', { flowId: body['flowId'], password: 'Password@123' });
    expect(password.statusCode).toBe(403);
    const change = await post('challenge/change', { flowId: body['flowId'], method: 'EMAIL_OTP' });
    expect(change.statusCode).toBe(403);

    /** Platform admins keep the local password path so a broken upstream can't lock operators out. */
    const admin = await env.getService(UserService).createUserWithPassword({ email: `breakglass@${DOMAIN}`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const platformOrg = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, String(platformOrg?.id));

    const adminInit = await post('login/init', { identifier: `breakglass@${DOMAIN}` });
    const adminBody = adminInit.json() as Json;
    expect(adminBody['status']).toBe('AWAITING_PASSWORD');
    expect((adminBody['federated'] as Json)['enforced']).toBe(false);
  });

  it('should validate the provider configuration surface', async () => {
    const owner = await env.getService(UserService).createUserWithPassword({ email: 'idp-admin@corp.test', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const organisation = await env.getService(OrganisationService).createTeam(owner.id, { name: 'Config Org' });
    const secret = (await env.getService(SessionService).create({ userId: owner.id, aal: 'AAL2' })).secret;
    const request = (body: Record<string, unknown>) => {
      const csrf = csrfPair();
      return env
        .getRouter()
        .mockRequest()
        .post(`/api/v1/organisations/${organisation.id}/identity-providers`)
        .headers({ 'x-csrf-token': csrf.header })
        .cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie })
        .body(body);
    };

    const badIssuer = await request({ name: 'Bad', issuer: `${upstream.issuer}/not-the-issuer`, clientId: 'x', clientSecret: 'y' });
    expect(badIssuer.statusCode).toBe(400);

    const first = await request({ name: 'Good', issuer: upstream.issuer, clientId: 'x', clientSecret: 'y' });
    expect(first.statusCode).toBe(201);
    expect(JSON.stringify(first.json())).not.toContain('y');

    const second = await request({ name: 'Second', issuer: upstream.issuer, clientId: 'x', clientSecret: 'y' });
    expect(second.statusCode).toBe(409);
  });
});
