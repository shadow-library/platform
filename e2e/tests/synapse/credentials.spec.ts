import {
  type CredentialItem,
  type CredentialProbe,
  fakeSecret,
  getCredential,
  type KeyringStatus,
  listCredentials,
  readCredentialEvents,
  readCredentialRow,
  readKeyringStatus,
  registerCredential,
  revokeCredential,
  rotateCredentialSecret,
  testCredential,
  uniqueCredentialName,
  unreachableOrigin,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectError, jsonOf } from './helpers';

const CREDENTIALS_ROLE = ['SynapseCredentialsAdmin'] as const;
const UNREACHABLE_CODES = ['connect', 'timeout'];
const PROBE_TIMEOUT_MS = 60_000;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

async function namesListedBy(ctx: Parameters<typeof listCredentials>[0]): Promise<string[]> {
  return (await jsonOf<{ items: CredentialItem[] }>(await listCredentials(ctx))).items.map(item => item.name);
}

test.describe('synapse credentials administration', () => {
  test('should create a credential, store it sealed under the active key and answer with its hint alone', async ({ synapse }) => {
    const admin = await synapse.staff({ label: 'create', roles: CREDENTIALS_ROLE });
    const secret = fakeSecret();
    const name = uniqueCredentialName('create');
    const origin = unreachableOrigin();

    const created = await registerCredential(admin.ctx, { name, allowedOrigin: `${origin.toUpperCase()}:443`, secret });
    const createdText = await created.text();
    expect(created.status(), createdText).toBe(201);
    const item = JSON.parse(createdText) as CredentialItem;
    synapse.trackCredential(item.id);

    expect(createdText, 'no response ever carries the secret').not.toContain(secret);
    expect(item).toMatchObject({ name, allowedOrigin: origin, hint: `${secret.slice(0, 6)}…${secret.slice(-4)}`, version: 1, createdBy: admin.user.sub, referencedBy: [] });
    expect(item.rotatedAt).toBeUndefined();
    expect(item.revokedAt).toBeUndefined();

    const status = await jsonOf<KeyringStatus>(await readKeyringStatus(admin.ctx));
    expect(item.kid, 'a new secret is sealed under the active key').toBe(status.activeKeyId);
    expect(status.keys.find(key => key.kid === item.kid)).toMatchObject({ inKeyring: true });
    expect(status.keys.find(key => key.kid === item.kid)?.credentials).toBeGreaterThanOrEqual(1);

    const row = await readCredentialRow(item.id);
    expect(row?.secret, 'the stored secret is an envelope').toMatchObject({ v: 1, alg: 'A256GCM', kid: item.kid });
    expect(row?.secretText, 'the plaintext is nowhere in the row').not.toContain(secret);
    expect(await readCredentialEvents(item.id)).toEqual([{ action: 'create', actor: admin.user.sub }]);

    const fetched = await getCredential(admin.ctx, item.id);
    expect(await jsonOf<CredentialItem>(fetched)).toEqual(item);
    const listed = await listCredentials(admin.ctx);
    const listedText = await listed.text();
    expect(listedText).not.toContain(secret);
    expect((JSON.parse(listedText) as { items: CredentialItem[] }).items.find(listing => listing.id === item.id)).toEqual(item);

    await expectError(await registerCredential(admin.ctx, { name, allowedOrigin: origin, secret: fakeSecret() }), 409, 'CRED_NAME_TAKEN');
    expect((await namesListedBy(admin.ctx)).filter(listing => listing === name)).toHaveLength(1);
  });

  test('should refuse a malformed name, origin or secret and store nothing', async ({ synapse }) => {
    const admin = await synapse.staff({ label: 'invalid', roles: CREDENTIALS_ROLE });
    const valid = () => ({ name: uniqueCredentialName('invalid'), allowedOrigin: unreachableOrigin(), secret: fakeSecret() });
    const rejected: [string, Record<string, unknown>, number, string][] = [
      ['an upper-case name', { ...valid(), name: 'E2E-Upper-Case' }, 422, 'VALIDATION_ERROR'],
      ['an empty name', { ...valid(), name: '' }, 422, 'VALIDATION_ERROR'],
      ['a secret under eight characters', { ...valid(), secret: 'short' }, 422, 'VALIDATION_ERROR'],
      ['a secret holding a space', { ...valid(), secret: 'e2e fake secret with spaces' }, 422, 'VALIDATION_ERROR'],
      ['a secret over 4096 characters', { ...valid(), secret: 'x'.repeat(4097) }, 422, 'VALIDATION_ERROR'],
      ['a body with no secret', { name: uniqueCredentialName('invalid'), allowedOrigin: unreachableOrigin() }, 422, 'VALIDATION_ERROR'],
      ['an origin carrying a path', { ...valid(), allowedOrigin: `${unreachableOrigin()}/v1` }, 400, 'SYN_INVALID_REQUEST'],
      ['an origin that is not http', { ...valid(), allowedOrigin: 'ftp://e2e-origin.invalid' }, 400, 'SYN_INVALID_REQUEST'],
    ];

    for (const [label, body, status, code] of rejected) {
      const response = await registerCredential(admin.ctx, body);
      if (response.status() === 201) synapse.trackCredential(((await response.json()) as CredentialItem).id);
      expect(response.status(), `${label}: ${await response.text()}`).toBe(status);
      expect(((await response.json()) as { code?: string }).code, label).toBe(code);
    }
    const stored = await namesListedBy(admin.ctx);
    for (const [label, body] of rejected) expect(stored, label).not.toContain(body['name']);
  });

  test('should rotate a secret, move the version and hint, and keep using the new secret', async ({ synapse }) => {
    test.setTimeout(PROBE_TIMEOUT_MS);
    const admin = await synapse.staff({ label: 'rotate', roles: CREDENTIALS_ROLE });
    const created = await synapse.credential(admin, { label: 'rotate' });
    const before = await readCredentialRow(created.id);
    const next = fakeSecret();

    const rotated = await rotateCredentialSecret(admin.ctx, created.id, next);
    const rotatedText = await rotated.text();
    expect(rotated.status(), rotatedText).toBe(200);
    expect(rotatedText).not.toContain(next);
    expect(rotatedText).not.toContain(created.secret);
    const item = JSON.parse(rotatedText) as CredentialItem;
    expect(item).toMatchObject({ id: created.id, name: created.name, version: 2, hint: `${next.slice(0, 6)}…${next.slice(-4)}`, kid: created.kid });
    expect(item.rotatedAt).toBeDefined();

    const after = await readCredentialRow(created.id);
    expect(after?.version).toBe(2);
    expect(after?.secretText, 'the old envelope is replaced, not kept').not.toBe(before?.secretText);
    expect(after?.secretText).not.toContain(next);
    expect((await readCredentialEvents(created.id)).map(event => event.action)).toEqual(['create', 'rotate']);

    const probe = await jsonOf<CredentialProbe>(await testCredential(admin.ctx, created.id));
    expect(probe.ok).toBe(false);
    expect(UNREACHABLE_CODES, 'the sealed secret opened and the call left for the credential origin').toContain(probe.code);
    await expectError(await rotateCredentialSecret(admin.ctx, MISSING_ID, next), 404, 'S009');
    await expectError(await rotateCredentialSecret(admin.ctx, created.id, 'short'), 422, 'VALIDATION_ERROR');
  });

  test('should report a test of an unreachable origin as a code, never the secret', async ({ synapse }) => {
    test.setTimeout(PROBE_TIMEOUT_MS);
    const admin = await synapse.staff({ label: 'probe', roles: CREDENTIALS_ROLE });
    const created = await synapse.credential(admin, { label: 'probe' });

    const response = await testCredential(admin.ctx, created.id);
    const text = await response.text();
    expect(response.status(), text).toBe(200);
    expect(text).not.toContain(created.secret);
    const probe = JSON.parse(text) as CredentialProbe;
    expect(Object.keys(probe).sort()).toEqual(['code', 'ok']);
    expect(probe.ok).toBe(false);
    expect(UNREACHABLE_CODES).toContain(probe.code);
  });

  test('should revoke a credential, keep its name reserved and refuse to rotate or test it afterwards', async ({ synapse }) => {
    const admin = await synapse.staff({ label: 'revoke', roles: CREDENTIALS_ROLE });
    const created = await synapse.credential(admin, { label: 'revoke' });

    const revoked = await revokeCredential(admin.ctx, created.id);
    const item = await jsonOf<CredentialItem>(revoked);
    expect(item).toMatchObject({ id: created.id, name: created.name, referencedBy: [] });
    expect(item.revokedAt).toBeDefined();
    expect((await readCredentialRow(created.id))?.revokedAt).not.toBeNull();

    const again = await jsonOf<CredentialItem>(await revokeCredential(admin.ctx, created.id));
    expect(again.revokedAt, 'revoking twice changes nothing').toBe(item.revokedAt);
    expect((await readCredentialEvents(created.id)).map(event => event.action)).toEqual(['create', 'revoke']);

    await expectError(await rotateCredentialSecret(admin.ctx, created.id, fakeSecret()), 409, 'CRED_REVOKED');
    expect(await jsonOf<CredentialProbe>(await testCredential(admin.ctx, created.id))).toEqual({ ok: false, code: 'revoked_api_key' });
    await expectError(await registerCredential(admin.ctx, { name: created.name, allowedOrigin: unreachableOrigin(), secret: fakeSecret() }), 409, 'CRED_NAME_TAKEN');
    expect((await jsonOf<CredentialItem>(await getCredential(admin.ctx, created.id))).revokedAt, 'a revoked credential stays readable').toBe(item.revokedAt);
    expect((await readCredentialRow(created.id))?.secret, 'revoking keeps the sealed row').toMatchObject({ v: 1 });
  });

  test('should answer an unknown or malformed credential id with 404 and 422', async ({ synapse }) => {
    const admin = await synapse.staff({ label: 'unknown-id', roles: CREDENTIALS_ROLE });

    await expectError(await getCredential(admin.ctx, MISSING_ID), 404, 'S009');
    await expectError(await revokeCredential(admin.ctx, MISSING_ID), 404, 'S009');
    expect((await getCredential(admin.ctx, 'not-a-credential-id')).status()).toBe(422);
  });
});

test.describe('synapse credentials permission', () => {
  test('should refuse every credential route to a caller without synapse:credentials:manage and leave the credential untouched', async ({ synapse }) => {
    const manager = await synapse.staff({ label: 'manager', roles: CREDENTIALS_ROLE });
    const catalogAdmin = await synapse.staff({ label: 'catalog-admin', roles: ['SynapseAdmin'] });
    const bare = await synapse.staff({ label: 'bare' });
    const guest = await synapse.guest();
    const created = await synapse.credential(manager, { label: 'guarded' });
    const attempted = uniqueCredentialName('refused');

    for (const caller of [catalogAdmin.ctx, bare.ctx]) {
      await expectError(await listCredentials(caller), 403, 'IAM_002');
      await expectError(await getCredential(caller, created.id), 403, 'IAM_002');
      await expectError(await registerCredential(caller, { name: attempted, allowedOrigin: unreachableOrigin(), secret: fakeSecret() }), 403, 'IAM_002');
      await expectError(await rotateCredentialSecret(caller, created.id, fakeSecret()), 403, 'IAM_002');
      await expectError(await testCredential(caller, created.id), 403, 'IAM_002');
      await expectError(await revokeCredential(caller, created.id), 403, 'IAM_002');
      await expectError(await readKeyringStatus(caller), 403, 'IAM_002');
    }
    await expectError(await listCredentials(guest), 401, 'IAM_001');

    const untouched = await jsonOf<CredentialItem>(await getCredential(manager.ctx, created.id));
    expect(untouched).toMatchObject({ id: created.id, version: 1 });
    expect(untouched.revokedAt).toBeUndefined();
    expect(await namesListedBy(manager.ctx), 'a refused create stored nothing').not.toContain(attempted);
  });

  test('should keep credential management apart from catalog administration', async ({ synapse }) => {
    const manager = await synapse.staff({ label: 'credentials-only', roles: CREDENTIALS_ROLE });
    const catalogAdmin = await synapse.staff({ label: 'catalog-only', roles: ['SynapseAdmin'] });

    expect((await listCredentials(manager.ctx)).status()).toBe(200);
    await expectError(await manager.ctx.get('/api/v1/admin/catalog/versions'), 403, 'IAM_002');
    expect((await catalogAdmin.ctx.get('/api/v1/admin/catalog/versions')).status(), 'the catalog admin reads the catalog it may edit').toBe(200);
  });
});
