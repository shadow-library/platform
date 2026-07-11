/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

import { SignedXml } from 'xml-crypto';

/**
 * Importing user defined packages
 */
import { IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SamlKeyService, SamlService } from '@server/modules/auth/saml';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('saml-idp').init();
const SP_ENTITY_ID = 'https://sp.example.com';
const SP_ACS_URL = 'https://sp.example.com/saml/acs';

const buildAuthnRequest = (options: { issuer?: string; acsUrl?: string; id?: string } = {}) => {
  const id = options.id ?? `_${randomUUID()}`;
  const acs = options.acsUrl ? ` AssertionConsumerServiceURL="${options.acsUrl}"` : '';
  const xml =
    `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="${id}" Version="2.0" IssueInstant="${new Date().toISOString()}"${acs}>` +
    `<saml:Issuer>${options.issuer ?? SP_ENTITY_ID}</saml:Issuer></samlp:AuthnRequest>`;
  return { id, encoded: deflateRawSync(Buffer.from(xml)).toString('base64') };
};

const extractResponse = (html: string): string => {
  const match = html.match(/name="SAMLResponse" value="([^"]+)"/);
  if (!match?.[1]) throw new Error('No SAMLResponse in page');
  return Buffer.from(match[1], 'base64').toString('utf-8');
};

const verifySignature = (xml: string, certificatePem: string): boolean => {
  const signature = xml.match(/<Signature[\s\S]*?<\/Signature>/);
  if (!signature) throw new Error('No signature in assertion');
  const verifier = new SignedXml({ publicCert: certificatePem });
  verifier.loadSignature(signature[0]);
  return verifier.checkSignature(xml);
};

describe('SAML 2.0 IdP', () => {
  let userId: bigint;
  let sessionSecret: string;

  const ssoRequest = (encoded: string, secret?: string, relayState?: string) => {
    const params = new URLSearchParams({ SAMLRequest: encoded });
    if (relayState) params.set('RelayState', relayState);
    const chain = env.getRouter().mockRequest().get(`/saml2/sso?${params.toString()}`);
    return secret ? chain.cookies({ [SESSION_COOKIE_NAME]: secret }) : chain;
  };

  beforeEach(async () => {
    const user = await env
      .getService(UserService)
      .createUserWithPassword({ email: 'saml-user@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true, firstName: 'Sam', lastName: 'Lee' });
    userId = user.id;
    sessionSecret = (await env.getService(SessionService).create({ userId, aal: 'AAL1' })).secret;
    await env.getService(SamlService).createServiceProvider({ entityId: SP_ENTITY_ID, name: 'Example SP', acsUrl: SP_ACS_URL, releasedAttributes: ['email', 'first_name'] });
  });

  it('should serve idp metadata with the signing certificate', async () => {
    const response = await env.getRouter().mockRequest().get('/saml2/metadata');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/xml');
    expect(response.body).toContain('IDPSSODescriptor');
    expect(response.body).toContain('<ds:X509Certificate>');
    expect(response.body).toContain('/saml2/sso');
  });

  it('should answer an sp-initiated request with a signed assertion posted to the registered acs', async () => {
    const request = buildAuthnRequest();
    const response = await ssoRequest(request.encoded, sessionSecret, 'app-state-42');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(`action="${SP_ACS_URL}"`);
    expect(response.body).toContain('name="RelayState" value="app-state-42"');

    const xml = extractResponse(response.body as string);
    expect(xml).toContain(`InResponseTo="${request.id}"`);
    expect(xml).toContain(`<saml:Audience>${SP_ENTITY_ID}</saml:Audience>`);
    expect(xml).toContain('saml-user@example.com');
    expect(xml).toContain('Name="first_name"');
    expect(xml).not.toContain('Name="last_name"');

    const certificate = env.getService(SamlKeyService).getActiveKey().certificatePem;
    expect(verifySignature(xml, certificate)).toBe(true);
  });

  it('should park the request for login and resume it exactly once', async () => {
    const request = buildAuthnRequest();
    const parked = await ssoRequest(request.encoded);
    expect(parked.statusCode).toBe(302);
    const location = String(parked.headers['location']);
    expect(location).toContain('return_to=');

    const resumeUrl = decodeURIComponent(location.split('return_to=')[1] as string).replace(/^https?:\/\/[^/]+/, '');
    const resumed = await env
      .getRouter()
      .mockRequest()
      .get(resumeUrl)
      .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
    expect(resumed.statusCode).toBe(200);
    expect(extractResponse(resumed.body as string)).toContain(`InResponseTo="${request.id}"`);

    const replayed = await env
      .getRouter()
      .mockRequest()
      .get(resumeUrl)
      .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
    expect(replayed.statusCode).toBe(410);
  });

  it('should reject unknown issuers, acs mismatches and malformed requests alike', async () => {
    const unknown = await ssoRequest(buildAuthnRequest({ issuer: 'https://rogue.example.com' }).encoded, sessionSecret);
    expect(unknown.statusCode).toBe(400);

    const mismatch = await ssoRequest(buildAuthnRequest({ acsUrl: 'https://rogue.example.com/acs' }).encoded, sessionSecret);
    expect(mismatch.statusCode).toBe(400);

    const malformed = await ssoRequest(Buffer.from('not xml').toString('base64'), sessionSecret);
    expect(malformed.statusCode).toBe(400);
  });

  it('should mint stable pairwise name ids for persistent service providers', async () => {
    const saml = env.getService(SamlService);
    await saml.createServiceProvider({ entityId: 'https://sp2.example.com', name: 'SP Two', acsUrl: 'https://sp2.example.com/acs', nameIdFormat: 'PERSISTENT' });
    const request = () => {
      const xml =
        `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
        `ID="_${randomUUID()}" Version="2.0" IssueInstant="${new Date().toISOString()}"><saml:Issuer>https://sp2.example.com</saml:Issuer></samlp:AuthnRequest>`;
      return deflateRawSync(Buffer.from(xml)).toString('base64');
    };

    const first = extractResponse((await ssoRequest(request(), sessionSecret)).body as string);
    const second = extractResponse((await ssoRequest(request(), sessionSecret)).body as string);
    const nameId = (xml: string) => xml.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/)?.[1];
    expect(nameId(first)).toMatch(/^sp-[0-9a-f]{64}$/);
    expect(nameId(first)).toBe(nameId(second) as string);
    expect(first).toContain('nameid-format:persistent');
  });

  it('should keep old assertions verifiable through metadata across a key rotation', async () => {
    const keys = env.getService(SamlKeyService);
    const oldCertificate = keys.getActiveKey().certificatePem;
    await keys.rotate();

    const metadata = await env.getRouter().mockRequest().get('/saml2/metadata');
    expect((String(metadata.body).match(/<ds:X509Certificate>/g) ?? []).length).toBe(2);

    const xml = extractResponse((await ssoRequest(buildAuthnRequest().encoded, sessionSecret)).body as string);
    const newCertificate = keys.getActiveKey().certificatePem;
    expect(newCertificate).not.toBe(oldCertificate);
    expect(verifySignature(xml, newCertificate)).toBe(true);
  });

  it('should manage service providers over the admin api', async () => {
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    const admin = await env.getService(UserService).createUserWithPassword({ email: 'saml-admin@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, String(organisation?.id));
    const adminSecret = (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' })).secret;

    const request = (method: 'get' | 'post' | 'patch' | 'delete', path: string) => {
      const csrf = csrfPair();
      const chain = env.getRouter().mockRequest()[method](path);
      return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: adminSecret, 'csrf-token': csrf.cookie });
    };

    const created = await request('post', '/api/v1/admin/saml/service-providers').body({
      entityId: 'https://sp3.example.com',
      name: 'SP Three',
      acsUrl: 'https://sp3.example.com/acs',
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const insecure = await request('post', '/api/v1/admin/saml/service-providers').body({
      entityId: 'https://sp4.example.com',
      name: 'SP Four',
      acsUrl: 'http://sp4.example.com/acs',
    });
    expect(insecure.statusCode).toBe(400);

    const disabled = await request('patch', `/api/v1/admin/saml/service-providers/${id}`).body({ isActive: false });
    expect(disabled.statusCode).toBe(200);

    const xml =
      `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
      `ID="_${randomUUID()}" Version="2.0" IssueInstant="${new Date().toISOString()}"><saml:Issuer>https://sp3.example.com</saml:Issuer></samlp:AuthnRequest>`;
    const rejected = await ssoRequest(deflateRawSync(Buffer.from(xml)).toString('base64'), sessionSecret);
    expect(rejected.statusCode).toBe(400);

    const removed = await request('delete', `/api/v1/admin/saml/service-providers/${id}`);
    expect(removed.statusCode).toBe(200);

    const denied = await env
      .getRouter()
      .mockRequest()
      .get('/api/v1/admin/saml/service-providers')
      .cookies({ [SESSION_COOKIE_NAME]: sessionSecret });
    expect(denied.statusCode).toBe(403);
  });
});
