/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  getSamlMetadata,
  getSamlSp,
  type IdentityUser,
  idpSigningCertificates,
  idpSsoLocation,
  listSamlSps,
  parkedResumeId,
  parseAutoPostForm,
  parseSamlResponse,
  patchSamlSp,
  registerSamlSp,
  relayStateToken,
  removeSamlSp,
  requireProductUrl,
  resumeSamlSso,
  samlAuthnRequest,
  type SamlResponse,
  type SamlSp,
  samlSpBody,
  startRawSamlSso,
  startSamlSso,
  verifySamlSignature,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';
import { expectRefused } from './helpers';

/**
 * Defining types
 */

interface SamlActor {
  readonly user: IdentityUser;
  readonly sessionId: string;
  readonly ctx: APIRequestContext;
}

/**
 * Declaring the constants
 *
 * Identity's SAML 2.0 IdP, driven by the scripted service provider in `lib/saml-sp.ts`: it builds the `AuthnRequest`,
 * reads the auto-post form and verifies the assertion's signature against the certificate the IdP metadata publishes.
 * Identity never calls an ACS itself — it hands the browser a form — so every service provider here points at a
 * fictional `example.test` endpoint and nothing has to listen.
 *
 * Service providers are global rows keyed by `entity_id`, so each test registers its own and asserts on that one alone;
 * nothing here reads or changes another spec's provider.
 */

const ISSUER = new URL(requireProductUrl('identity')).origin;
const PERSISTENT_NAME_ID = /^sp-[0-9a-f]{64}$/;
const NAME_ID_EMAIL = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
const NAME_ID_PERSISTENT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent';

async function signedIn(identity: IdentityHarness, label: string): Promise<SamlActor> {
  const user = await identity.createUser({ label, firstName: 'Saml', lastName: 'Subject' });
  const { session, ctx } = await identity.signIn(user);
  return { user, sessionId: session.sessionId, ctx };
}

/** The assertion a 200 auto-post form carries, with the form's own target and `RelayState`. */
async function assertionOf(response: APIResponse): Promise<SamlResponse & { acsUrl: string; relayState?: string }> {
  expect(response.status(), await response.text()).toBe(200);
  const form = parseAutoPostForm(await response.text());
  return { ...parseSamlResponse(form.samlResponse), acsUrl: form.acsUrl, ...(form.relayState === undefined ? {} : { relayState: form.relayState }) };
}

/** Completes one SP-initiated round trip and returns what the service provider would receive. */
async function singleSignOn(actor: SamlActor, serviceProvider: SamlSp): Promise<SamlResponse> {
  const request = samlAuthnRequest({ entityId: serviceProvider.entityId, acsUrl: serviceProvider.acsUrl });
  const assertion = await assertionOf(await startSamlSso(actor.ctx, request));
  expect(assertion.inResponseTo, 'the response answers the request that was sent').toBe(request.id);
  return assertion;
}

async function activeCertificates(ctx: APIRequestContext): Promise<string[]> {
  const response = await getSamlMetadata(ctx);
  expect(response.status(), await response.text()).toBe(200);
  return idpSigningCertificates(await response.text());
}

test.describe('identity saml sso', () => {
  test('should publish IdP metadata carrying a signing certificate and the sign-on location', async ({ identity }) => {
    const anonymous = await identity.anonymous();

    const response = await getSamlMetadata(anonymous);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/xml');
    expect(response.headers()['cache-control']).toBe('public, max-age=300');

    const metadata = await response.text();
    expect(metadata).toContain('<md:IDPSSODescriptor');
    expect(metadata).toContain('<ds:X509Certificate>');
    expect(idpSsoLocation(metadata)).toBe(`${ISSUER}/saml2/sso`);
    expect(idpSigningCertificates(metadata).length, 'the metadata publishes the certificate assertions are signed with').toBeGreaterThan(0);
  });

  test('should answer an SP-initiated request with a signed assertion holding only the released attributes', async ({ identity }) => {
    const serviceProvider = await identity.createSamlSp({ label: 'sso', releasedAttributes: ['email', 'first_name'] });
    const actor = await signedIn(identity, 'saml-sso');
    const relayState = relayStateToken();
    const request = samlAuthnRequest({ entityId: serviceProvider.entityId, acsUrl: serviceProvider.acsUrl });

    const response = await startSamlSso(actor.ctx, request, relayState);
    const assertion = await assertionOf(response);

    expect(assertion.acsUrl, 'the form posts to the registered ACS, never to the one the request asked for').toBe(serviceProvider.acsUrl);
    expect(assertion.relayState).toBe(relayState);
    expect(assertion.status).toBe('urn:oasis:names:tc:SAML:2.0:status:Success');
    expect(assertion.issuer).toBe(ISSUER);
    expect(assertion.destination).toBe(serviceProvider.acsUrl);
    expect(assertion.inResponseTo).toBe(request.id);
    expect(assertion.assertion).toMatchObject({
      audience: serviceProvider.entityId,
      nameId: actor.user.email,
      nameIdFormat: NAME_ID_EMAIL,
      sessionIndex: actor.sessionId,
      recipient: serviceProvider.acsUrl,
      inResponseTo: request.id,
    });

    expect(assertion.assertion.attributes).toEqual({ email: actor.user.email, first_name: 'Saml' });
    expect(assertion.assertion.attributes['last_name'], 'an attribute the provider did not ask for is withheld although the profile carries it').toBeUndefined();

    const [certificate] = await activeCertificates(actor.ctx);
    expect(assertion.assertion.signingCertificate, 'the assertion is signed with the certificate the metadata publishes').toBe(certificate);
    expect(verifySamlSignature(assertion.xml, certificate as string)).toBe(true);
    const altered = assertion.xml.replace(actor.user.email, 'attacker@shadow-apps.test');
    expect(verifySamlSignature(altered, certificate as string), 'the same check rejects an assertion edited after signing').toBe(false);
  });

  test('should park a request made without a session and release the assertion exactly once after sign-in', async ({ identity }) => {
    const serviceProvider = await identity.createSamlSp({ label: 'park' });
    const actor = await signedIn(identity, 'saml-park');
    const anonymous = await identity.anonymous();
    const relayState = relayStateToken();
    const request = samlAuthnRequest({ entityId: serviceProvider.entityId, acsUrl: serviceProvider.acsUrl });

    const parked = await startSamlSso(anonymous, request, relayState);
    expect(parked.status()).toBe(302);
    const location = parked.headers()['location'] ?? '';
    expect(location).toContain(`${ISSUER}/login?return_to=`);
    const resumeId = parkedResumeId(location);

    const stillAnonymous = await resumeSamlSso(anonymous, resumeId);
    expect(stillAnonymous.status(), 'resuming without a session sends the caller back to sign in').toBe(302);
    expect(parkedResumeId(stillAnonymous.headers()['location'] ?? ''), 'and leaves the parked request unconsumed').toBe(resumeId);

    const resumed = await assertionOf(await resumeSamlSso(actor.ctx, resumeId));
    expect(resumed.inResponseTo, 'the resumed response answers the request that was parked').toBe(request.id);
    expect(resumed.relayState).toBe(relayState);
    expect(resumed.assertion.nameId).toBe(actor.user.email);

    await expectRefused(await resumeSamlSso(actor.ctx, resumeId), 410, 'SML_003', 'a parked request is consumed by the first resume');
  });

  test('should give a PERSISTENT service provider a pairwise name id that is stable per provider', async ({ identity }) => {
    const first = await identity.createSamlSp({ label: 'pairwise-a', nameIdFormat: 'PERSISTENT' });
    const second = await identity.createSamlSp({ label: 'pairwise-b', nameIdFormat: 'PERSISTENT' });
    const actor = await signedIn(identity, 'saml-pairwise');

    const initial = await singleSignOn(actor, first);
    expect(initial.assertion.nameIdFormat).toBe(NAME_ID_PERSISTENT);
    expect(initial.assertion.nameId).toMatch(PERSISTENT_NAME_ID);
    expect(initial.assertion.nameId, 'a pairwise name id never discloses the address').not.toContain(actor.user.email);

    const repeat = await singleSignOn(actor, first);
    expect(repeat.assertion.nameId, 'the same user reaching the same provider again is the same subject').toBe(initial.assertion.nameId);

    const other = await singleSignOn(actor, second);
    expect(other.assertion.nameId, 'another provider gets another subject for the same user').not.toBe(initial.assertion.nameId);
    expect(other.assertion.nameId).toMatch(PERSISTENT_NAME_ID);
  });

  // App bug: a `/saml2` reply written with `reply.send` (saml.controller.ts:28, :68) is answered `content-encoding: gzip`
  // with an empty body by the global @fastify/compress of http-core.module.ts:113-116, so every real SP and browser — none
  // of which ask for `identity` encoding — gets nothing at all.
  test.fixme('should serve the SAML documents to a client that accepts compression', async ({ identity }) => {
    const serviceProvider = await identity.createSamlSp({ label: 'compressed' });
    const actor = await signedIn(identity, 'saml-compressed');
    const request = samlAuthnRequest({ entityId: serviceProvider.entityId, acsUrl: serviceProvider.acsUrl });

    const metadata = await actor.ctx.get('/saml2/metadata');
    expect(metadata.status()).toBe(200);
    expect((await metadata.text()).length, 'metadata reaches a client that accepts gzip').toBeGreaterThan(0);

    const sso = await actor.ctx.get(`/saml2/sso?${new URLSearchParams({ SAMLRequest: request.encoded }).toString()}`);
    expect(sso.status()).toBe(200);
    expect((await sso.text()).length, 'the auto-post form reaches a client that accepts gzip').toBeGreaterThan(0);
  });
});

test.describe('identity saml administration', () => {
  test('should refuse an unknown issuer, an ACS mismatch, a malformed request and a deactivated provider', async ({ identity }) => {
    const serviceProvider = await identity.createSamlSp({ label: 'refusals' });
    const actor = await signedIn(identity, 'saml-refusals');
    const admin = await identity.admin();

    const unknown = samlAuthnRequest({ entityId: `${serviceProvider.entityId}-unregistered` });
    await expectRefused(await startSamlSso(actor.ctx, unknown), 400, 'SML_001', 'an unregistered issuer is refused');

    const mismatched = samlAuthnRequest({ entityId: serviceProvider.entityId, acsUrl: `${serviceProvider.acsUrl}/elsewhere` });
    await expectRefused(await startSamlSso(actor.ctx, mismatched), 400, 'SML_002', 'an ACS the provider never registered is refused');

    const malformed = Buffer.from('<not-an-authn-request/>', 'utf8').toString('base64');
    await expectRefused(await startRawSamlSso(actor.ctx, malformed), 400, 'SML_001', 'a request that is not an AuthnRequest is refused');

    expect((await patchSamlSp(admin.ctx, serviceProvider.id, { isActive: false })).status()).toBe(200);
    const deactivated = samlAuthnRequest({ entityId: serviceProvider.entityId, acsUrl: serviceProvider.acsUrl });
    await expectRefused(await startSamlSso(actor.ctx, deactivated), 400, 'SML_001', 'a deactivated provider signs nobody in');

    expect((await patchSamlSp(admin.ctx, serviceProvider.id, { isActive: true })).status()).toBe(200);
    const restored = await singleSignOn(actor, serviceProvider);
    expect(restored.assertion.nameId, 'reactivating the provider restores sign-on').toBe(actor.user.email);
  });

  test('should let an elevated admin manage service providers and refuse an ordinary user', async ({ identity }) => {
    const admin = await identity.admin();
    const actor = await signedIn(identity, 'saml-admin');
    const body = samlSpBody({ label: 'managed', releasedAttributes: ['email', 'display_name'] });

    const created = await registerSamlSp(admin.ctx, { ...body });
    expect(created.status(), await created.text()).toBe(201);
    const serviceProvider = (await created.json()) as SamlSp;
    identity.trackSamlSp(serviceProvider.id);
    expect(serviceProvider).toMatchObject({ entityId: body.entityId, name: body.name, acsUrl: body.acsUrl, nameIdFormat: 'EMAIL', isActive: true });
    expect(serviceProvider.releasedAttributes).toEqual(['email', 'display_name']);

    const insecure = await registerSamlSp(admin.ctx, { ...samlSpBody({ label: 'insecure' }), acsUrl: 'http://sp.example.test/acs' });
    await expectRefused(insecure, 400, 'SML_002', 'a plain-http ACS is refused at registration');

    const outsider = await identity.createUser({ label: 'saml-outsider' });
    const { ctx: outsiderCtx } = await identity.signIn(outsider, { aal: 'AAL2' });
    await expectRefused(await listSamlSps(outsiderCtx), 403, 'ADM_001', 'an ordinary user may not list service providers');
    await expectRefused(await registerSamlSp(outsiderCtx, { ...samlSpBody({ label: 'usurped' }) }), 403, 'ADM_001', 'a stepped-up ordinary user may not register one either');

    const listed = await listSamlSps(admin.ctx);
    expect(listed.status()).toBe(200);
    const { items } = (await listed.json()) as { items: SamlSp[] };
    expect(
      items.find(item => item.id === serviceProvider.id),
      'the admin list carries the provider just registered',
    ).toMatchObject({ entityId: body.entityId });

    const renamed = await patchSamlSp(admin.ctx, serviceProvider.id, { name: `${body.name}-renamed` });
    expect(renamed.status(), await renamed.text()).toBe(200);
    expect(((await (await getSamlSp(admin.ctx, serviceProvider.id)).json()) as SamlSp).name).toBe(`${body.name}-renamed`);

    const removed = await removeSamlSp(admin.ctx, serviceProvider.id);
    expect(removed.status(), await removed.text()).toBe(200);
    expect(await removed.json()).toEqual({ success: true });
    await expectRefused(await getSamlSp(admin.ctx, serviceProvider.id), 404, 'SML_004', 'a deleted provider is gone from the admin API');
    const orphaned = samlAuthnRequest({ entityId: body.entityId, acsUrl: body.acsUrl });
    await expectRefused(await startSamlSso(actor.ctx, orphaned), 400, 'SML_001', 'and signs nobody in');
  });

  test('should gate an assertion on the access rules of the application the provider is linked to', async ({ identity }) => {
    const reachable = await identity.createOAuthApp('saml-open');
    const unreachable = await identity.createOAuthApp('saml-closed', { visibility: 'RESTRICTED' });
    const linkedToReachable = await identity.createSamlSp({ label: 'linked-open', applicationId: reachable.applicationId });
    const linkedToUnreachable = await identity.createSamlSp({ label: 'linked-closed', applicationId: unreachable.applicationId });
    const unlinked = await identity.createSamlSp({ label: 'unlinked' });
    const actor = await signedIn(identity, 'saml-linked');

    const granted = await singleSignOn(actor, linkedToReachable);
    expect(granted.assertion.nameId, 'a provider linked to an application the user may reach still asserts').toBe(actor.user.email);

    const denied = await startSamlSso(actor.ctx, samlAuthnRequest({ entityId: linkedToUnreachable.entityId, acsUrl: linkedToUnreachable.acsUrl }));
    expect(denied.status()).toBe(302);
    const location = new URL(denied.headers()['location'] ?? '', ISSUER);
    expect(location.pathname).toBe('/error');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(await denied.text(), 'a denied request carries no assertion').not.toContain('SAMLResponse');

    const unaffected = await singleSignOn(actor, unlinked);
    expect(unaffected.assertion.nameId, 'a provider linked to no application is unaffected').toBe(actor.user.email);
  });
});
