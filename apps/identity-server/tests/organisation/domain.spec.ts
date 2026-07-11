/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { DnsTxtResolver, OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

type Method = 'get' | 'post' | 'delete';

interface DomainJson {
  id: string;
  status: string;
  txtRecordName: string;
  txtRecordValue: string;
  lastCheckError?: string;
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('org-domain').init();

describe('Verified domains', () => {
  let ownerId: bigint;
  let ownerSecret: string;
  let orgId: string;

  const request = (method: Method, path: string, secret: string, body?: Record<string, unknown>) => {
    const csrf = csrfPair();
    const base = env.getRouter().mockRequest()[method](path);
    const chain = base.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: secret, 'csrf-token': csrf.cookie });
    return body ? chain.body(body) : chain;
  };

  const session = async (userId: bigint, aal: 'AAL1' | 'AAL2' = 'AAL2') => (await env.getService(SessionService).create({ userId, aal })).secret;

  /** Points the resolver seam at a canned zone; domain verification must never hit real DNS in tests. */
  const stubDns = (zone: Record<string, string[] | Error>) => {
    const resolver = env.getService(DnsTxtResolver);
    resolver.resolveTxt = async (name: string) => {
      const records = zone[name];
      if (!records) throw new Error(`ENOTFOUND ${name}`);
      if (records instanceof Error) throw records;
      return records;
    };
  };

  const registerDomain = async (domain: string, secret = ownerSecret, organisationId = orgId): Promise<DomainJson> => {
    const response = await request('post', `/api/v1/organisations/${organisationId}/domains`, secret, { domain });
    expect(response.statusCode).toBe(201);
    return response.json() as DomainJson;
  };

  beforeEach(async () => {
    const users = env.getService(UserService);
    ownerId = (await users.createUserWithPassword({ email: 'owner@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    ownerSecret = await session(ownerId);
    orgId = (await env.getService(OrganisationService).createTeam(ownerId, { name: 'Domain Team' })).id.toString();
  });

  it('should register a domain and hand back the TXT challenge', async () => {
    const domain = await registerDomain('example.com');
    expect(domain.status).toBe('PENDING');
    expect(domain.txtRecordName).toBe('_shadow-identity.example.com');
    expect(domain.txtRecordValue).toMatch(/^shadow-identity-verification=[0-9a-f]{32}$/);
  });

  it('should reject invalid and duplicate domains', async () => {
    const invalid = await request('post', `/api/v1/organisations/${orgId}/domains`, ownerSecret, { domain: 'not a domain' });
    expect(invalid.statusCode).toBe(400);

    await registerDomain('dup.example.com');
    const duplicate = await request('post', `/api/v1/organisations/${orgId}/domains`, ownerSecret, { domain: 'dup.example.com' });
    expect(duplicate.statusCode).toBe(409);
  });

  it('should verify a domain whose TXT record matches', async () => {
    const domain = await registerDomain('verified.example.com');
    stubDns({ '_shadow-identity.verified.example.com': ['unrelated=1', domain.txtRecordValue] });

    const response = await request('post', `/api/v1/organisations/${orgId}/domains/${domain.id}/verify`, ownerSecret);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'VERIFIED' });
  });

  it('should fail verification when the record is missing or DNS errors', async () => {
    const missing = await registerDomain('missing.example.com');
    stubDns({ '_shadow-identity.missing.example.com': ['shadow-identity-verification=wrong'] });
    const wrongToken = await request('post', `/api/v1/organisations/${orgId}/domains/${missing.id}/verify`, ownerSecret);
    expect(wrongToken.json()).toMatchObject({ status: 'FAILED', lastCheckError: 'verification TXT record not found' });

    const erroring = await registerDomain('nxdomain.example.com');
    stubDns({});
    const dnsError = await request('post', `/api/v1/organisations/${orgId}/domains/${erroring.id}/verify`, ownerSecret);
    expect((dnsError.json() as DomainJson).status).toBe('FAILED');
    expect((dnsError.json() as DomainJson).lastCheckError).toContain('ENOTFOUND');
  });

  it('should allow a failed domain to pass on re-check', async () => {
    const domain = await registerDomain('retry.example.com');
    stubDns({});
    await request('post', `/api/v1/organisations/${orgId}/domains/${domain.id}/verify`, ownerSecret);
    stubDns({ '_shadow-identity.retry.example.com': [domain.txtRecordValue] });

    const response = await request('post', `/api/v1/organisations/${orgId}/domains/${domain.id}/verify`, ownerSecret);
    expect(response.json()).toMatchObject({ status: 'VERIFIED' });
  });

  it('should let only one organisation hold a domain verified', async () => {
    const domain = await registerDomain('contested.example.com');
    stubDns({ '_shadow-identity.contested.example.com': [domain.txtRecordValue] });
    await request('post', `/api/v1/organisations/${orgId}/domains/${domain.id}/verify`, ownerSecret);

    const rivalId = (await env.getService(UserService).createUserWithPassword({ email: 'rival@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })).id;
    const rivalSecret = await session(rivalId);
    const rivalOrg = (await env.getService(OrganisationService).createTeam(rivalId, { name: 'Rival Team' })).id.toString();
    const rivalDomain = await registerDomain('contested.example.com', rivalSecret, rivalOrg);
    stubDns({ '_shadow-identity.contested.example.com': [rivalDomain.txtRecordValue] });

    const response = await request('post', `/api/v1/organisations/${rivalOrg}/domains/${rivalDomain.id}/verify`, rivalSecret);
    expect(response.json()).toMatchObject({ status: 'FAILED', lastCheckError: 'domain is verified by another organisation' });
  });

  it('should keep a verified domain verified through a failed re-check', async () => {
    const domain = await registerDomain('sticky.example.com');
    stubDns({ '_shadow-identity.sticky.example.com': [domain.txtRecordValue] });
    await request('post', `/api/v1/organisations/${orgId}/domains/${domain.id}/verify`, ownerSecret);

    stubDns({});
    const response = await request('post', `/api/v1/organisations/${orgId}/domains/${domain.id}/verify`, ownerSecret);
    expect(response.json()).toMatchObject({ status: 'VERIFIED' });
  });

  it('should demand an elevated org admin for domain mutations', async () => {
    const memberId = (await env.getService(UserService).createUserWithPassword({ email: 'member@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true }))
      .id;
    await env.getService(OrganisationService).ensureMember(BigInt(orgId), memberId, 'MEMBER');

    const memberAttempt = await request('post', `/api/v1/organisations/${orgId}/domains`, await session(memberId), { domain: 'member.example.com' });
    expect(memberAttempt.statusCode).toBe(403);

    const unelevated = await request('post', `/api/v1/organisations/${orgId}/domains`, await session(ownerId, 'AAL1'), { domain: 'lowaal.example.com' });
    expect(unelevated.statusCode).toBe(403);
  });

  it('should list and remove domains within the organisation only', async () => {
    const domain = await registerDomain('removable.example.com');
    const list = await request('get', `/api/v1/organisations/${orgId}/domains`, ownerSecret);
    expect((list.json() as { domains: DomainJson[] }).domains).toHaveLength(1);

    const foreignerId = (
      await env.getService(UserService).createUserWithPassword({ email: 'foreign@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true })
    ).id;
    const foreignOrg = (await env.getService(OrganisationService).createTeam(foreignerId, { name: 'Foreign Team' })).id.toString();
    const crossTenant = await request('delete', `/api/v1/organisations/${foreignOrg}/domains/${domain.id}`, await session(foreignerId));
    expect(crossTenant.statusCode).toBe(404);

    const removed = await request('delete', `/api/v1/organisations/${orgId}/domains/${domain.id}`, ownerSecret);
    expect(removed.statusCode).toBe(200);
    const after = await request('get', `/api/v1/organisations/${orgId}/domains`, ownerSecret);
    expect((after.json() as { domains: DomainJson[] }).domains).toHaveLength(0);
  });
});
