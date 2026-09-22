/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  clusterTokensAvailable,
  decodeJwt,
  hmacJwt,
  type JwtClaims,
  mintServiceAccountToken,
  type OAuthApplication,
  registerOAuthClient,
  requireProductUrl,
  selfSignedJwt,
  swapJwtPayload,
  type TokenResponseBody,
  unsignedJwt,
  updateOAuthClient,
  WORKLOAD_ISSUER,
  workloadGrant,
  workloadSubject,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';

/**
 * Defining types
 */

interface WorkloadClient {
  readonly application: OAuthApplication;
  readonly clientId: string;
}

/**
 * Declaring the constants
 *
 * Kubernetes workload identity: a pod authenticates at the token endpoint with its projected service-account token instead of
 * a client secret. Tokens are minted through `kubectl create token` against the dev cluster's own issuer, which is the only
 * signer identity trusts, so every scenario needs a real service account — each binding therefore uses a distinct one, never
 * a service account a shipped client already claims (identity binds `pulse-server`, `novel-forge-server`, `web-novel-server`
 * and `memoir-server`), because identity refuses to bind one exact subject to two clients. That binding namespace is shared
 * by the whole deployment, which is why this file runs in the single-worker `identity-serial` project.
 *
 * An assertion that identity cannot verify is refused identically however it is broken — the server never says which check
 * failed — so the forged cases assert the shared refusal and each group ends by proving the honest token still mints.
 */

const ISSUER = new URL(requireProductUrl('identity')).origin;

/** Service accounts that exist in the dev cluster and that no shipped client binds. */
const FREE_SERVICE_ACCOUNTS = {
  primary: { namespace: 'kube-public', name: 'default' },
  second: { namespace: 'logging', name: 'default' },
  patterned: { namespace: 'system', name: 'default' },
  unbound: { namespace: 'shadow-memoir', name: 'default' },
} as const;

/** The audiences a projected token carries when nobody asks for identity's — the cluster's own, which identity must refuse. */
const CLUSTER_DEFAULT_AUDIENCES = [WORKLOAD_ISSUER, 'kubernetes.default.svc', 'api'];

test.beforeAll(async () => {
  test.skip(!(await clusterTokensAvailable()), 'kubectl cannot mint service-account tokens against k3d-shadow-apps-dev');
});

function assertionFor(namespace: string, name: string, audiences: string[] = [ISSUER]): Promise<string> {
  return mintServiceAccountToken(namespace, name, { audiences });
}

async function workloadClient(identity: IdentityHarness, label: string, workloadSubjects: string[]): Promise<WorkloadClient> {
  const admin = (await identity.admin()).ctx;
  const application = await identity.createOAuthApp(`wi-${label}`);
  const client = await registerOAuthClient(admin, application, { kind: 'SERVICE', grantTypes: ['client_credentials'], workloadSubjects });
  expect(client.secret, 'a workload client is never issued a secret').toBeUndefined();
  return { application, clientId: client.clientId };
}

async function expectServiceToken(response: APIResponse, clientId: string, audience: string): Promise<JwtClaims> {
  const body = (await response.json()) as TokenResponseBody;
  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body.token_type).toBe('Bearer');
  const claims = decodeJwt(body.access_token ?? '').payload;
  expect(claims).toMatchObject({ sub: clientId, client_id: clientId, token_type: 'service', aud: audience });
  return claims;
}

async function expectRefused(response: APIResponse, reason: string): Promise<void> {
  const body = (await response.json()) as TokenResponseBody;
  expect(response.status(), `${reason}: ${JSON.stringify(body)}`).toBe(401);
  expect(body.code, reason).toBe('invalid_client');
  expect(body.access_token, 'a refused assertion must not mint a token').toBeUndefined();
}

test.describe('identity workload identity', () => {
  test('should mint a service token for a bound service account with no client secret', async ({ identity }) => {
    const { namespace, name } = FREE_SERVICE_ACCOUNTS.primary;
    const { application, clientId } = await workloadClient(identity, 'bound', [workloadSubject(namespace, name)]);
    const ctx = await identity.anonymous();
    const assertion = await assertionFor(namespace, name);

    const claims = await expectServiceToken(await workloadGrant(ctx, assertion, { resource: application.audience }), clientId, application.audience);
    expect(claims.sub, 'the issued token names the client, never the service account').not.toBe(workloadSubject(namespace, name));
    await expectServiceToken(await workloadGrant(ctx, assertion, { clientId, resource: application.audience }), clientId, application.audience);
  });

  test('should mint under one client for either of its bound service accounts and refuse an unbound one', async ({ identity }) => {
    const [first, second, unbound] = [FREE_SERVICE_ACCOUNTS.primary, FREE_SERVICE_ACCOUNTS.second, FREE_SERVICE_ACCOUNTS.unbound];
    const bindings = [workloadSubject(first.namespace, first.name), workloadSubject(second.namespace, second.name)];
    const { application, clientId } = await workloadClient(identity, 'pair', bindings);
    const ctx = await identity.anonymous();

    for (const account of [first, second]) {
      await expectServiceToken(await workloadGrant(ctx, await assertionFor(account.namespace, account.name), { resource: application.audience }), clientId, application.audience);
    }
    await expectRefused(await workloadGrant(ctx, await assertionFor(unbound.namespace, unbound.name)), 'a subject bound to no client');
    await expectRefused(await workloadGrant(ctx, await assertionFor(unbound.namespace, unbound.name), { clientId }), 'a subject the named client does not bind');
  });

  test('should honour a namespace pattern only when the caller names its client', async ({ identity }) => {
    const { namespace, name } = FREE_SERVICE_ACCOUNTS.patterned;
    const { application, clientId } = await workloadClient(identity, 'pattern', [`system:serviceaccount:${namespace}:*`]);
    const ctx = await identity.anonymous();
    const assertion = await assertionFor(namespace, name);

    await expectRefused(await workloadGrant(ctx, assertion), 'a pattern binding resolved by subject alone');
    await expectServiceToken(await workloadGrant(ctx, assertion, { clientId, resource: application.audience }), clientId, application.audience);
  });

  test('should refuse another workload impersonating a client and refuse a deactivated one', async ({ identity }) => {
    const { namespace, name } = FREE_SERVICE_ACCOUNTS.primary;
    const admin = (await identity.admin()).ctx;
    const { application, clientId } = await workloadClient(identity, 'impersonate', [workloadSubject(namespace, name)]);
    const ctx = await identity.anonymous();
    const assertion = await assertionFor(namespace, name);

    const foreign = await mintServiceAccountToken('pulse', 'pulse-server', { audiences: [ISSUER] });
    await expectRefused(await workloadGrant(ctx, foreign, { clientId }), 'another namespace workload naming this client');
    await expectServiceToken(await workloadGrant(ctx, assertion, { resource: application.audience }), clientId, application.audience);

    await updateOAuthClient(admin, clientId, { isActive: false });
    await expectRefused(await workloadGrant(ctx, assertion), 'a deactivated bound client');
    await updateOAuthClient(admin, clientId, { isActive: true });
    await expectServiceToken(await workloadGrant(ctx, assertion, { resource: application.audience }), clientId, application.audience);
  });

  test('should refuse every audience but its own and accept one listed alongside others', async ({ identity }) => {
    const { namespace, name } = FREE_SERVICE_ACCOUNTS.primary;
    const { application, clientId } = await workloadClient(identity, 'audience', [workloadSubject(namespace, name)]);
    const ctx = await identity.anonymous();

    for (const audience of CLUSTER_DEFAULT_AUDIENCES) {
      await expectRefused(await workloadGrant(ctx, await assertionFor(namespace, name, [audience])), `an assertion addressed to ${audience}`);
    }
    await expectRefused(await workloadGrant(ctx, await mintServiceAccountToken(namespace, name)), 'an assertion carrying only the cluster default audiences');

    const shared = await assertionFor(namespace, name, [ISSUER, 'https://other.example.test']);
    expect(decodeJwt(shared).payload.aud).toEqual([ISSUER, 'https://other.example.test']);
    await expectServiceToken(await workloadGrant(ctx, shared, { resource: application.audience }), clientId, application.audience);
  });

  test('should refuse an assertion it cannot verify and a secretless call carrying no assertion', async ({ identity }) => {
    const { namespace, name } = FREE_SERVICE_ACCOUNTS.primary;
    const { application, clientId } = await workloadClient(identity, 'forged', [workloadSubject(namespace, name)]);
    const ctx = await identity.anonymous();
    const assertion = await assertionFor(namespace, name);
    const honest = decodeJwt(assertion).payload;

    await expectRefused(await workloadGrant(ctx, selfSignedJwt(honest), { clientId }), 'an assertion signed by a key the cluster does not publish');
    await expectRefused(await workloadGrant(ctx, unsignedJwt(assertion), { clientId }), 'an alg:none assertion');
    await expectRefused(await workloadGrant(ctx, hmacJwt(honest, 'secret', String(decodeJwt(assertion).header.kid)), { clientId }), 'an HS256 assertion');
    await expectRefused(
      await workloadGrant(ctx, swapJwtPayload(assertion, { sub: workloadSubject('kube-system', 'default') }), { clientId }),
      'a token whose claims were rewritten',
    );
    await expectRefused(await workloadGrant(ctx, assertion, { assertionType: 'urn:example:client-assertion-type:made-up' }), 'an unknown client-assertion type');

    const spoofed = await ctx.post('/oauth2/token', {
      form: { grant_type: 'client_credentials', client_id: clientId },
      headers: { 'x-service-account': workloadSubject(namespace, name) },
    });
    await expectRefused(spoofed, 'a secretless call asserting its service account in a header');

    await expectServiceToken(await workloadGrant(ctx, assertion, { resource: application.audience }), clientId, application.audience);
  });
});
