/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SessionService } from '@server/modules/auth/session';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

type Json = Record<string, unknown>;

/**
 * Declaring the constants
 */
const env = new TestEnvironment('scim').init();
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';

describe('SCIM 2.0 provisioning', () => {
  let token: string;
  let orgId: bigint;

  const provisionTenant = async (domain: string, orgName: string): Promise<{ token: string; orgId: bigint }> => {
    const owner = await env.getService(UserService).createUserWithPassword({ email: `owner@${domain}`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const organisation = await env.getService(OrganisationService).createTeam(owner.id, { name: orgName });
    await env
      .getPostgresClient()
      .insert(schema.organisationDomains)
      .values({ organisationId: organisation.id, domain, verificationToken: 'token', status: 'VERIFIED', verifiedAt: new Date() });

    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const scopeId = await env.getService(OAuthClientService).ensureScope(applicationId, 'shadow-identity', 'scim:provision');
    const client = await env
      .getService(OAuthClientService)
      .register({ applicationId, name: `${orgName} SCIM`, kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [scopeId], organisationId: organisation.id });

    const response = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .body({ grant_type: 'client_credentials', client_id: client.clientId, client_secret: client.secret, scope: 'scim:provision' });
    expect(response.statusCode).toBe(200);
    return { token: (response.json() as { access_token: string }).access_token, orgId: organisation.id };
  };

  const scim = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, bearer = token) => {
    const chain = env.getRouter().mockRequest()[method](`/scim/v2${path}`);
    return chain.headers({ authorization: `Bearer ${bearer}`, 'content-type': 'application/scim+json' });
  };

  const createUser = async (userName: string, extra: Json = {}): Promise<Json> => {
    const response = await scim('post', '/Users').body({ schemas: [USER_SCHEMA], userName, name: { givenName: 'Pat', familyName: 'Doe' }, ...extra });
    expect(response.statusCode).toBe(201);
    return response.json() as Json;
  };

  beforeEach(async () => {
    const tenant = await provisionTenant('acme.example.com', 'Acme Corp');
    token = tenant.token;
    orgId = tenant.orgId;
  });

  it('should reject unauthenticated, mis-scoped and org-unbound callers', async () => {
    const anonymous = await env.getRouter().mockRequest().get('/scim/v2/Users');
    expect(anonymous.statusCode).toBe(401);

    const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const scopeId = await env.getService(OAuthClientService).ensureScope(applicationId, 'shadow-identity', 'authz:check');
    const wrongScope = await env
      .getService(OAuthClientService)
      .register({ applicationId, name: 'Wrong Scope', kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [scopeId], organisationId: orgId });
    const wrongToken = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .body({ grant_type: 'client_credentials', client_id: wrongScope.clientId, client_secret: wrongScope.secret, scope: 'authz:check' });
    const misScoped = await scim('get', '/Users', (wrongToken.json() as { access_token: string }).access_token);
    expect(misScoped.statusCode).toBe(403);

    const scimScope = await env.getService(OAuthClientService).ensureScope(applicationId, 'shadow-identity', 'scim:provision');
    const unbound = await env
      .getService(OAuthClientService)
      .register({ applicationId, name: 'Unbound', kind: 'SERVICE', grantTypes: ['client_credentials'], scopeIds: [scimScope] });
    const unboundToken = await env
      .getRouter()
      .mockRequest()
      .post('/oauth2/token')
      .body({ grant_type: 'client_credentials', client_id: unbound.clientId, client_secret: unbound.secret, scope: 'scim:provision' });
    const orgless = await scim('get', '/Users', (unboundToken.json() as { access_token: string }).access_token);
    expect(orgless.statusCode).toBe(403);
    expect((orgless.json() as Json)['schemas']).toEqual(['urn:ietf:params:scim:api:messages:2.0:Error']);
  });

  it('should provision a new account joined to the organisation', async () => {
    const resource = await createUser('pat@acme.example.com', { externalId: 'ext-1' });
    expect(resource).toMatchObject({ schemas: [USER_SCHEMA], userName: 'pat@acme.example.com', active: true, externalId: 'ext-1' });
    expect((resource['meta'] as Json)['resourceType']).toBe('User');

    const user = await env.getService(UserService).getUser('pat@acme.example.com');
    expect(user).not.toBeNull();
    expect(user?.status).toBe('ACTIVE');
    const membership = await env.getService(OrganisationService).getMembership(user?.id ?? 0n, orgId);
    expect(membership?.role).toBe('MEMBER');
  });

  it('should refuse userNames outside the verified domains and duplicates', async () => {
    const foreign = await scim('post', '/Users').body({ schemas: [USER_SCHEMA], userName: 'someone@gmail.com' });
    expect(foreign.statusCode).toBe(400);
    expect((foreign.json() as Json)['scimType']).toBe('invalidValue');

    await createUser('dup@acme.example.com');
    const duplicate = await scim('post', '/Users').body({ schemas: [USER_SCHEMA], userName: 'dup@acme.example.com' });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as Json)['scimType']).toBe('uniqueness');
  });

  it('should deactivate a managed account and cut its sessions', async () => {
    const resource = await createUser('worker@acme.example.com');
    const user = await env.getService(UserService).getUser('worker@acme.example.com');
    const session = await env.getService(SessionService).create({ userId: user?.id ?? 0n, aal: 'AAL1' });

    /** Entra sends booleans as strings in PATCH values — the quirk must round-trip. */
    const patched = await scim('patch', `/Users/${resource['id']}`).body({
      schemas: [PATCH_SCHEMA],
      Operations: [{ op: 'Replace', path: 'active', value: 'False' }],
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as Json)['active']).toBe(false);

    const after = await env.getService(UserService).getUser(user?.id ?? 0n);
    expect(after?.status).toBe('DISABLED');
    expect(await env.getService(SessionService).validate(session.secret)).toBeNull();

    const reactivated = await scim('patch', `/Users/${resource['id']}`).body({ schemas: [PATCH_SCHEMA], Operations: [{ op: 'replace', value: { active: true } }] });
    expect(reactivated.statusCode).toBe(200);
    expect((await env.getService(UserService).getUser(user?.id ?? 0n))?.status).toBe('ACTIVE');
  });

  it('should adopt an existing account and only ever strip membership on deprovision', async () => {
    const existing = await env
      .getService(UserService)
      .createUserWithPassword({ email: 'veteran@acme.example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });

    const resource = await createUser('veteran@acme.example.com');
    expect((await env.getService(OrganisationService).getMembership(existing.id, orgId))?.role).toBe('MEMBER');

    const removed = await scim('delete', `/Users/${resource['id']}`);
    expect(removed.statusCode).toBe(204);

    expect(await env.getService(OrganisationService).getMembership(existing.id, orgId)).toBeNull();
    expect((await env.getService(UserService).getUser(existing.id))?.status).toBe('ACTIVE');
  });

  it('should list with filters and paginate', async () => {
    await createUser('alpha@acme.example.com');
    await createUser('beta@acme.example.com');

    const filtered = await scim('get', `/Users?filter=${encodeURIComponent('userName eq "ALPHA@acme.example.com"')}`);
    const filteredBody = filtered.json() as Json;
    expect(filteredBody['totalResults']).toBe(1);
    expect(((filteredBody['Resources'] as Json[])[0] as Json)['userName']).toBe('alpha@acme.example.com');

    const paged = await scim('get', '/Users?startIndex=2&count=1');
    const pagedBody = paged.json() as Json;
    expect(pagedBody['totalResults']).toBe(2);
    expect(pagedBody['startIndex']).toBe(2);
    expect((pagedBody['Resources'] as Json[]).length).toBe(1);

    const badFilter = await scim('get', `/Users?filter=${encodeURIComponent('emails co "x"')}`);
    expect(badFilter.statusCode).toBe(400);
    expect((badFilter.json() as Json)['scimType']).toBe('invalidFilter');
  });

  it('should treat userName as immutable and apply profile patches to managed accounts', async () => {
    const resource = await createUser('mut@acme.example.com');

    const renamed = await scim('put', `/Users/${resource['id']}`).body({ schemas: [USER_SCHEMA], userName: 'other@acme.example.com', active: true });
    expect(renamed.statusCode).toBe(400);
    expect((renamed.json() as Json)['scimType']).toBe('mutability');

    const patched = await scim('patch', `/Users/${resource['id']}`).body({
      schemas: [PATCH_SCHEMA],
      Operations: [
        { op: 'replace', path: 'name.givenName', value: 'Patricia' },
        { op: 'replace', path: 'displayName', value: 'Patricia D' },
      ],
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json() as Json;
    expect((body['name'] as Json)['givenName']).toBe('Patricia');
    expect(body['displayName']).toBe('Patricia D');
  });

  it('should manage groups with member semantics', async () => {
    const alpha = await createUser('g-alpha@acme.example.com');
    const beta = await createUser('g-beta@acme.example.com');

    const created = await scim('post', '/Groups').body({ displayName: 'Engineering', members: [{ value: alpha['id'] }] });
    expect(created.statusCode).toBe(201);
    const group = created.json() as Json;
    expect((group['members'] as Json[]).length).toBe(1);

    const duplicate = await scim('post', '/Groups').body({ displayName: 'engineering' });
    expect(duplicate.statusCode).toBe(409);

    const added = await scim('patch', `/Groups/${group['id']}`).body({
      schemas: [PATCH_SCHEMA],
      Operations: [{ op: 'Add', path: 'members', value: [{ value: beta['id'] }] }],
    });
    expect(added.statusCode).toBe(200);
    expect(((added.json() as Json)['members'] as Json[]).length).toBe(2);

    /** Entra's single-member removal uses the value-filter path form. */
    const removed = await scim('patch', `/Groups/${group['id']}`).body({
      schemas: [PATCH_SCHEMA],
      Operations: [{ op: 'Remove', path: `members[value eq "${alpha['id']}"]` }],
    });
    expect(((removed.json() as Json)['members'] as Json[]).map(member => member['value'])).toEqual([beta['id']]);

    const userView = await scim('get', `/Users/${beta['id']}`);
    expect(((userView.json() as Json)['groups'] as Json[]).map(entry => entry['value'])).toEqual([group['id']]);
  });

  it('should isolate tenants completely', async () => {
    const resource = await createUser('isolated@acme.example.com');
    const other = await provisionTenant('globex.example.com', 'Globex');

    const foreignGet = await scim('get', `/Users/${resource['id']}`, other.token);
    expect(foreignGet.statusCode).toBe(404);

    const foreignList = await scim('get', '/Users', other.token);
    expect((foreignList.json() as Json)['totalResults']).toBe(0);

    const crossMember = await scim('post', '/Groups', other.token).body({ displayName: 'Sneaky', members: [{ value: resource['id'] }] });
    expect(crossMember.statusCode).toBe(400);
  });

  it('should serve provider discovery documents', async () => {
    const config = await scim('get', '/ServiceProviderConfig');
    expect(config.statusCode).toBe(200);
    expect((config.json() as Json)['patch']).toMatchObject({ supported: true });
    expect(String(config.headers['content-type'])).toContain('application/scim+json');

    const types = await scim('get', '/ResourceTypes');
    expect(((types.json() as Json)['Resources'] as Json[]).map(type => type['id'])).toEqual(['User', 'Group']);
  });
});
