/**
 * Importing npm packages
 */

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  APPLE_ISSUER,
  type AuthModeSnapshot,
  clearIpState,
  countFederatedIdentities,
  createAdminApi,
  createGlobalProvider,
  deleteGlobalProvider,
  freshClientIp,
  type GlobalProvider,
  type GlobalProviderSnapshot,
  GOOGLE_ISSUER,
  identityMutate,
  LINK_LOCAL_ISSUER,
  linkFederatedIdentity,
  listAuthModes,
  listGlobalProviders,
  putAuthMode,
  readProviderSecretCiphertext,
  registerGlobalProvider,
  restoreAuthMode,
  restoreGlobalProviders,
  setProviderTokenEndpoint,
  snapshotAuthMode,
  snapshotGlobalProviders,
  updateGlobalProvider,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface SocialStart {
  flowId: string;
  authorizationUrl: string;
}

/**
 * Declaring the constants
 *
 * Federation configuration and the gates around it. The platform-wide social providers are a single global row per
 * kind, and a social auth mode is enabled exactly when its provider is active, so this file runs in the
 * `identity-serial` project (one worker, no in-file parallelism) and puts the provider set and the SMS_OTP override
 * back exactly as it found them.
 *
 * The SSRF guard's refusal is not separable from a failed fetch out here: the guard call and the discovery request
 * share one `try`, and every failure funnels into FED_001. So the guard cases assert what is observable — the
 * refusal and an untouched provider table — plus how fast it comes back, since a guard refusal is immediate and a
 * connect attempt to an unroutable address is not.
 *
 * Registering a provider runs real OIDC discovery against the issuer, so the tests that do it are gated on the
 * cluster being able to reach `accounts.google.com`, as the workload specs are gated on `kubectl`.
 *
 * What is NOT here: everything that needs a mock upstream IdP to answer a token or JWKS request. The strict target
 * guard refuses any private or plain-http upstream, so no receiver on this host is reachable from identity.
 */

/** A public hostname that resolves to 127.0.0.1 — the rebinding shape the delivery-time guard exists to catch. */
const LOOPBACK_TOKEN_ENDPOINT = 'https://localtest.me/token';

/** Well under `DISCOVERY_TIMEOUT_MS` (10 s) and far above a refusal that never opens a socket. */
const IMMEDIATE_REFUSAL_MS = 2_000;

const DISCOVERY_SKIP_REASON = 'the cluster cannot reach accounts.google.com, so no provider can be registered';

let discovery: Promise<boolean> | undefined;

/** Registers and removes a real provider once per worker, so the tests that need upstream discovery can skip instead of fail. */
function discoveryAvailable(): Promise<boolean> {
  return (discovery ??= (async () => {
    const clientIp = await freshClientIp();
    const admin = await createAdminApi(clientIp);
    try {
      const probe = await createGlobalProvider(admin.ctx, { kind: 'GOOGLE', issuer: GOOGLE_ISSUER });
      if (probe.status() !== 201) return false;
      await deleteGlobalProvider(admin.ctx, ((await probe.json()) as GlobalProvider).id);
      return true;
    } catch {
      return false;
    } finally {
      await admin.dispose();
      await clearIpState(clientIp);
    }
  })());
}

function startSocialLogin(ctx: APIRequestContext, provider: string): Promise<APIResponse> {
  return ctx.post(`/api/v1/auth/social/${provider}/start`, { data: {} });
}

async function authMethods(ctx: APIRequestContext): Promise<{ password: boolean; smsOtp: boolean; social: { provider: string; label: string }[] }> {
  const response = await ctx.get('/api/v1/auth/methods');
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as { password: boolean; smsOtp: boolean; social: { provider: string; label: string }[] };
}

test.describe.configure({ mode: 'serial' });

test.describe('identity federation configuration', () => {
  let providers: GlobalProviderSnapshot[] = [];
  let smsOtp: AuthModeSnapshot | undefined;

  test.beforeAll(async () => {
    providers = await snapshotGlobalProviders();
    smsOtp = await snapshotAuthMode('SMS_OTP');
  });

  test.afterAll(async () => {
    await restoreGlobalProviders(providers);
    if (smsOtp) await restoreAuthMode(smsOtp);
  });

  test('should describe every sign-in method with its kind and configuration state', async ({ identity }) => {
    const admin = await identity.admin();
    const modes = await listAuthModes(admin.ctx);

    expect(modes.map(mode => mode.method)).toEqual(['PASSWORD', 'WEBAUTHN', 'EMAIL_OTP', 'SMS_OTP', 'GOOGLE', 'MICROSOFT', 'APPLE']);
    expect(modes.find(mode => mode.method === 'PASSWORD')).toMatchObject({ enabled: true, configured: true, kind: 'BUILT_IN' });
    expect(modes.find(mode => mode.method === 'SMS_OTP')).toMatchObject({ enabled: false, configured: true, kind: 'BUILT_IN' });
    expect(modes.find(mode => mode.method === 'GOOGLE')).toMatchObject({ enabled: false, configured: false, kind: 'SOCIAL' });
  });

  test('should refuse the auth-mode and provider administration to a caller without the clients permission', async ({ identity }) => {
    const outsider = await identity.createUser({ label: 'fed-outsider' });
    const { ctx } = await identity.signIn(outsider, { aal: 'AAL2' });

    const listed = await ctx.get('/api/v1/admin/auth-modes');
    expect(listed.status()).toBe(403);
    await expectErrorCode(listed, 'ADM_001');

    const toggled = await putAuthMode(ctx, 'SMS_OTP', true);
    expect(toggled.status()).toBe(403);
    await expectErrorCode(toggled, 'ADM_001');

    const configured = await createGlobalProvider(ctx, { kind: 'GOOGLE', issuer: GOOGLE_ISSUER });
    expect(configured.status()).toBe(403);
    await expectErrorCode(configured, 'ADM_001');
    expect(await listGlobalProviders(), 'a refused configuration stores nothing').toEqual([]);
  });

  test('should toggle a built-in mode, refuse an unconfigured social one and reject an unknown method', async ({ identity }) => {
    const admin = await identity.admin();

    const enabled = await putAuthMode(admin.ctx, 'SMS_OTP', true);
    expect(enabled.status(), await enabled.text()).toBe(200);
    expect((await listAuthModes(admin.ctx)).find(mode => mode.method === 'SMS_OTP')).toMatchObject({ enabled: true });
    expect((await putAuthMode(admin.ctx, 'SMS_OTP', false)).status()).toBe(200);

    const unconfigured = await putAuthMode(admin.ctx, 'GOOGLE', true);
    expect(unconfigured.status(), 'a social method needs its upstream credentials first').toBe(409);
    await expectErrorCode(unconfigured, 'FED_004');

    expect((await putAuthMode(admin.ctx, 'CARRIER_PIGEON', true)).status()).toBe(422);
  });

  test('should refuse a provider whose issuer is not one identity can use', async ({ identity }) => {
    const admin = await identity.admin();

    const multiTenant = await createGlobalProvider(admin.ctx, { kind: 'MICROSOFT', issuer: 'https://login.microsoftonline.com/common/v2.0' });
    expect(multiTenant.status(), 'a Microsoft issuer must name one tenant').toBe(400);
    await expectErrorCode(multiTenant, 'FED_005');

    const apple = await createGlobalProvider(admin.ctx, { kind: 'APPLE', issuer: APPLE_ISSUER });
    expect(apple.status(), 'Apple needs the team and key ids that sign its client secret').toBe(400);
    await expectErrorCode(apple, 'FED_007');

    expect(await listGlobalProviders(), 'nothing was stored').toEqual([]);
  });

  test('should configure a social provider without echoing its secret and keep it on a patch that omits it', async ({ identity }) => {
    test.skip(!(await discoveryAvailable()), DISCOVERY_SKIP_REASON);
    const admin = await identity.admin();

    const created = await createGlobalProvider(admin.ctx, { kind: 'GOOGLE', issuer: GOOGLE_ISSUER, clientId: 'e2e-google-client', clientSecret: 'e2e-google-secret' });
    expect(created.status(), await created.text()).toBe(201);
    expect(await created.text(), 'the upstream secret is never returned').not.toContain('e2e-google-secret');
    const provider = (await created.json()) as GlobalProvider;
    expect(provider).toMatchObject({ kind: 'GOOGLE', clientId: 'e2e-google-client', allowSignUp: true, isActive: true });

    const duplicate = await createGlobalProvider(admin.ctx, { kind: 'GOOGLE', issuer: GOOGLE_ISSUER });
    expect(duplicate.status(), 'one provider per social kind').toBe(409);
    await expectErrorCode(duplicate, 'FED_003');

    const ciphertext = await readProviderSecretCiphertext(provider.id);
    const renamed = await updateGlobalProvider(admin.ctx, provider.id, { name: 'E2E Google Renamed' });
    expect(renamed.status(), await renamed.text()).toBe(200);
    expect(await readProviderSecretCiphertext(provider.id), 'a patch without a secret keeps the stored one').toBe(ciphertext);

    expect((await putAuthMode(admin.ctx, 'GOOGLE', false)).status(), 'a configured provider can be switched off').toBe(200);
    expect((await listAuthModes(admin.ctx)).find(mode => mode.method === 'GOOGLE')).toMatchObject({ enabled: false, configured: true });
    expect((await putAuthMode(admin.ctx, 'GOOGLE', true)).status()).toBe(200);
    expect((await listAuthModes(admin.ctx)).find(mode => mode.method === 'GOOGLE')).toMatchObject({ enabled: true, configured: true });

    const removed = await deleteGlobalProvider(admin.ctx, provider.id);
    expect(removed.status(), await removed.text()).toBe(200);
    expect((await listAuthModes(admin.ctx)).find(mode => mode.method === 'GOOGLE')).toMatchObject({ enabled: false, configured: false });
    expect(await listGlobalProviders()).toEqual([]);
  });

  test('should offer and start a social sign-in only while its provider is configured and active', async ({ identity }) => {
    test.skip(!(await discoveryAvailable()), DISCOVERY_SKIP_REASON);
    const admin = await identity.admin();
    const anonymous = await identity.anonymous();

    expect(await authMethods(anonymous)).toMatchObject({ password: true, smsOtp: false, social: [] });
    const unconfigured = await startSocialLogin(anonymous, 'GOOGLE');
    expect(unconfigured.status(), 'an unconfigured provider is simply not there').toBe(404);
    await expectErrorCode(unconfigured, 'FED_002');

    const provider = await registerGlobalProvider(admin.ctx, { kind: 'GOOGLE', issuer: GOOGLE_ISSUER });
    expect((await authMethods(anonymous)).social).toEqual([{ provider: 'GOOGLE', label: 'Google' }]);

    const started = await startSocialLogin(anonymous, 'GOOGLE');
    expect(started.status(), await started.text()).toBe(200);
    const { flowId, authorizationUrl } = (await started.json()) as SocialStart;
    const url = new URL(authorizationUrl);
    expect(url.origin, 'the browser is sent to Google, never followed from here').toBe(GOOGLE_ISSUER);
    expect(url.searchParams.get('state')).toBe(flowId);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('prompt')).toBe('select_account');

    expect((await updateGlobalProvider(admin.ctx, provider.id, { isActive: false })).status()).toBe(200);
    const inactive = await startSocialLogin(anonymous, 'GOOGLE');
    expect(inactive.status(), 'an inactive provider is hidden just as hard').toBe(404);
    await expectErrorCode(inactive, 'FED_002');
    expect((await authMethods(anonymous)).social).toEqual([]);

    expect((await deleteGlobalProvider(admin.ctx, provider.id)).status()).toBe(200);
  });
});

test.describe('identity federation SSRF guard', () => {
  let providers: GlobalProviderSnapshot[] = [];

  test.beforeAll(async () => {
    providers = await snapshotGlobalProviders();
  });

  test.afterAll(async () => {
    await restoreGlobalProviders(providers);
  });

  // The positive control for this endpoint — a public issuer registering successfully — is the configuration test above.
  test('should refuse an issuer whose host is a link-local address and store nothing', async ({ identity }) => {
    const admin = await identity.admin();

    const startedAt = Date.now();
    const refused = await createGlobalProvider(admin.ctx, { kind: 'GOOGLE', issuer: LINK_LOCAL_ISSUER });
    const elapsedMs = Date.now() - startedAt;

    expect(refused.status(), 'the cloud metadata address is refused').toBe(400);
    await expectErrorCode(refused, 'FED_001');
    expect(await listGlobalProviders(), 'a refused discovery stores nothing').toEqual([]);
    expect(elapsedMs, 'it comes back at once, as a refusal does and a connect attempt does not').toBeLessThan(IMMEDIATE_REFUSAL_MS);
  });

  test('should fail a federated callback whose token endpoint resolves to loopback, linking nobody', async ({ identity }) => {
    test.skip(!(await discoveryAvailable()), DISCOVERY_SKIP_REASON);
    const admin = await identity.admin();
    const anonymous = await identity.anonymous();
    const provider = await registerGlobalProvider(admin.ctx, { kind: 'GOOGLE', issuer: GOOGLE_ISSUER });
    await setProviderTokenEndpoint(provider.id, LOOPBACK_TOKEN_ENDPOINT);

    const started = await startSocialLogin(anonymous, 'GOOGLE');
    expect(started.status(), await started.text()).toBe(200);
    const { flowId } = (await started.json()) as SocialStart;

    // The redirect never names the reason, and a refused target and an unreachable one are answered alike.
    const callback = await anonymous.get(`/api/v1/auth/federated/callback?state=${encodeURIComponent(flowId)}&code=e2e-upstream-code`, { maxRedirects: 0 });
    expect(callback.status()).toBe(302);
    const location = new URL(callback.headers().location ?? '', 'https://identity.invalid');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('federation_failed');
    expect(await countFederatedIdentities(provider.id), 'a failed exchange links no account').toBe(0);

    expect((await deleteGlobalProvider(admin.ctx, provider.id)).status()).toBe(200);
  });
});

test.describe('identity federated step-up', () => {
  const startStepUp = (ctx: APIRequestContext): Promise<APIResponse> => identityMutate(ctx, 'post', '/api/v1/auth/social/step-up/start', {});

  test('should start a federated step-up only for a linked account that has no other factor', async ({ identity }) => {
    const anonymous = await identity.anonymous();
    const unauthenticated = await anonymous.post('/api/v1/auth/social/step-up/start', { data: {} });
    expect(unauthenticated.status()).toBe(401);
    await expectErrorCode(unauthenticated, 'AUTH_005');

    const unlinked = await identity.createUser({ label: 'fed-unlinked', withPassword: false });
    const unlinkedCall = await startStepUp((await identity.signIn(unlinked)).ctx);
    expect(unlinkedCall.status(), 'a passwordless account with no link has nothing to step up with').toBe(404);
    await expectErrorCode(unlinkedCall, 'MFA_004');

    const withPassword = await identity.createUser({ label: 'fed-password' });
    const passwordCall = await startStepUp((await identity.signIn(withPassword)).ctx);
    expect(passwordCall.status(), 'an account with a password steps up with it instead').toBe(409);
    await expectErrorCode(passwordCall, 'MFA_003');

    const federated = await identity.createUser({ label: 'fed-linked', withPassword: false });
    await linkFederatedIdentity(federated, { isActive: true });
    const started = await startStepUp((await identity.signIn(federated)).ctx);
    expect(started.status(), await started.text()).toBe(200);
    const { flowId, authorizationUrl } = (await started.json()) as SocialStart;
    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('state')).toBe(flowId);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });
});
