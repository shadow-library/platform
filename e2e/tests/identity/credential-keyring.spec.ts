import { decodeJwt, fetchJwks, identityDb, IdentityWebhookError, issueTokens, registerOAuthClient, rotateWebhookSecret, verifyJwt } from '../../lib';
import { expect, test } from './fixtures';
import { expectSealedEnvelope } from './helpers';

interface SealedColumn {
  readonly table: string;
  readonly envelope: string;
  readonly legacy: string;
}

interface SealedColumnCounts {
  readonly legacyOnly: number;
  readonly malformed: number;
  readonly sealed: number;
}

interface WebhookStorage {
  readonly envelope: unknown;
  readonly previousEnvelope: unknown;
  readonly legacyCiphertext: string | null;
  readonly previousLegacyCiphertext: string | null;
  readonly previousExpiresAt: Date | null;
}

const SEALED_COLUMNS: readonly SealedColumn[] = [
  { table: 'signing_keys', envelope: 'private_key_envelope', legacy: 'private_key_ciphertext' },
  { table: 'identity_providers', envelope: 'client_secret_envelope', legacy: 'client_secret_ciphertext' },
  { table: 'mfa_enrollments', envelope: 'secret_envelope', legacy: 'secret_ciphertext' },
  { table: 'webhook_subscriptions', envelope: 'secret_envelope', legacy: 'secret_ciphertext' },
  { table: 'webhook_subscriptions', envelope: 'previous_secret_envelope', legacy: 'previous_secret_ciphertext' },
];
const BACKFILL_SETTLE_MS = 30_000;

async function countSealed(column: SealedColumn): Promise<SealedColumnCounts> {
  const sql = identityDb();
  const [row] = await sql<SealedColumnCounts[]>`
    SELECT
      count(*) FILTER (WHERE ${sql(column.envelope)} IS NULL AND ${sql(column.legacy)} IS NOT NULL)::int AS "legacyOnly",
      count(*) FILTER (WHERE ${sql(column.envelope)} IS NOT NULL AND jsonb_typeof(${sql(column.envelope)}) <> 'object')::int AS malformed,
      count(*) FILTER (WHERE ${sql(column.envelope)} IS NOT NULL)::int AS sealed
    FROM ${sql(column.table)}
  `;
  return row ?? { legacyOnly: 0, malformed: 0, sealed: 0 };
}

async function readWebhookStorage(webhookId: string): Promise<WebhookStorage> {
  const [row] = await identityDb()<WebhookStorage[]>`
    SELECT secret_envelope AS envelope, previous_secret_envelope AS "previousEnvelope", secret_ciphertext AS "legacyCiphertext",
           previous_secret_ciphertext AS "previousLegacyCiphertext", previous_secret_expires_at AS "previousExpiresAt"
    FROM webhook_subscriptions WHERE id = ${webhookId}
  `;
  if (!row) throw new IdentityWebhookError(`no webhook subscription ${webhookId}`);
  return row;
}

test.describe('identity credential keyring', () => {
  test('should leave no secret in a legacy-only row and every sealed column holding an envelope object once the backfill has run', async () => {
    for (const column of SEALED_COLUMNS) {
      await expect
        .poll(async () => (await countSealed(column)).legacyOnly, { message: `${column.table}.${column.envelope} still has legacy-only rows`, timeout: BACKFILL_SETTLE_MS })
        .toBe(0);
      expect((await countSealed(column)).malformed, `${column.table}.${column.envelope} holds something that is not a JSON object`).toBe(0);
    }
    expect((await countSealed(SEALED_COLUMNS[0] as SealedColumn)).sealed, 'identity always holds signing keys').toBeGreaterThan(0);
  });

  test('should sign a token with a stored signing key that holds an envelope and verifies against the published JWKS', async ({ identity }) => {
    const application = await identity.createOAuthApp('keyring');
    const client = await registerOAuthClient((await identity.admin()).ctx, application, { kind: 'WEB_CONFIDENTIAL' });
    const user = await identity.createUser({ label: 'keyring-sign' });
    const { ctx } = await identity.signIn(user);
    const anonymous = await identity.anonymous();

    const { accessToken } = await issueTokens(ctx, anonymous, client, { scope: 'openid' });
    expect(verifyJwt(accessToken, await fetchJwks(anonymous))).toMatchObject({ sub: user.sub });

    const kid = String(decodeJwt(accessToken).header.kid);
    const [key] = await identityDb()<{ envelope: unknown; purpose: string; status: string }[]>`
      SELECT private_key_envelope AS envelope, purpose, status FROM signing_keys WHERE kid = ${kid}::uuid
    `;
    expect(key).toMatchObject({ purpose: 'OIDC', status: expect.stringMatching(/^(ACTIVE|RETIRING)$/) });
    expectSealedEnvelope(key?.envelope);
  });

  test('should seal a webhook secret, write no legacy column, and demote the old secret into its own envelope on rotation', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const subscription = await identity.createWebhook({ label: 'sealed' });

    const created = await readWebhookStorage(subscription.id);
    expectSealedEnvelope(created.envelope, subscription.secret);
    expect(created).toMatchObject({ previousEnvelope: null, legacyCiphertext: null, previousLegacyCiphertext: null, previousExpiresAt: null });

    const rotated = await rotateWebhookSecret(admin, subscription.id);
    expect(rotated.status(), await rotated.text()).toBe(200);
    const { secret } = (await rotated.json()) as { secret: string };

    const after = await readWebhookStorage(subscription.id);
    expectSealedEnvelope(after.envelope, secret, subscription.secret);
    expectSealedEnvelope(after.previousEnvelope, secret, subscription.secret);
    expect(after.envelope, 'the new secret is sealed afresh').not.toEqual(created.envelope);
    expect(after.previousEnvelope, 'the demoted secret is bound to its own column, so its envelope is a new one').not.toEqual(created.envelope);
    expect(after).toMatchObject({ legacyCiphertext: null, previousLegacyCiphertext: null });
    expect(after.previousExpiresAt?.getTime() ?? 0, 'the old secret keeps verifying for an overlap window').toBeGreaterThan(Date.now());
  });
});
