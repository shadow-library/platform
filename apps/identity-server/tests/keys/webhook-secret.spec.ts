import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { CryptoErrorCode } from '@shadow-library/common/crypto';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type WebhookSubscription } from '@server/modules/infrastructure/datastore';
import { WebhookDeliveryService } from '@server/modules/infrastructure/webhook/webhook-delivery.service';
import { WebhookService } from '@server/modules/infrastructure/webhook/webhook.service';
import { SEALED_COLUMNS } from '@server/modules/auth/keys/sealed-secret.constants';

import { K2, LEGACY_WEBHOOK_CURRENT, LEGACY_WEBHOOK_PREVIOUS, sealerFor, WEBHOOK_CURRENT_SECRET, WEBHOOK_PREVIOUS_SECRET } from './keys.fixtures';

const HOUR_MS = 3_600_000;
const TIMESTAMP = 1_790_000_000;
const PAYLOAD = '{"type":"user.created"}';

let restoreLogger: RestoreLogger;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

function legacySubscription(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    id: 3n,
    secretEnvelope: null,
    previousSecretEnvelope: null,
    secretCiphertext: LEGACY_WEBHOOK_CURRENT,
    previousSecretCiphertext: LEGACY_WEBHOOK_PREVIOUS,
    previousSecretExpiresAt: new Date(Date.now() + HOUR_MS),
    kekVersion: 1,
    ...overrides,
  } as WebhookSubscription;
}

function servicesOver(row: { current: WebhookSubscription }) {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: () => Promise.resolve([row.current]) }) }) }),
    update: () => ({
      set: (values: Partial<WebhookSubscription>) => ({ where: () => ({ returning: () => Promise.resolve([(row.current = { ...row.current, ...values })]) }) }),
    }),
  };
  const postgres = { transaction: (work: (handle: unknown) => Promise<unknown>) => work(tx) };
  const databaseService = new FakeDatabaseService({ postgres });
  const webhookService = new WebhookService(databaseService, sealerFor(), {} as never);
  return { webhookService, delivery: new WebhookDeliveryService(databaseService, webhookService, {} as never) };
}

function signatureBy(secret: string): string {
  return `v1=${createHmac('sha256', secret).update(`${TIMESTAMP}.${PAYLOAD}`).digest('hex')}`;
}

describe('WebhookService signing secrets', () => {
  it('should sign with the current and previous secrets the previous image stored', async () => {
    const { webhookService, delivery } = servicesOver({ current: legacySubscription() });

    const header = delivery.signatureFor(await webhookService.signingSecretsOf(legacySubscription()), TIMESTAMP, PAYLOAD);

    expect(header).toBe(`t=${TIMESTAMP},${signatureBy(WEBHOOK_CURRENT_SECRET)},${signatureBy(WEBHOOK_PREVIOUS_SECRET)}`);
  });

  it('should drop the previous secret once its overlap has passed, or when there never was one', async () => {
    const { webhookService } = servicesOver({ current: legacySubscription() });

    const expired = await webhookService.signingSecretsOf(legacySubscription({ previousSecretExpiresAt: new Date(Date.now() - HOUR_MS) }));
    const none = await webhookService.signingSecretsOf(legacySubscription({ previousSecretCiphertext: null, previousSecretExpiresAt: null }));

    expect([expired, none]).toEqual([[WEBHOOK_CURRENT_SECRET], [WEBHOOK_CURRENT_SECRET]]);
  });

  it('should demote the current secret to previous on rotation, re-sealed under the previous-secret context', async () => {
    const row = { current: legacySubscription({ previousSecretCiphertext: null, previousSecretExpiresAt: null }) };
    const { webhookService, delivery } = servicesOver(row);

    const { subscription, secret } = await webhookService.rotateSecret(3n);
    const header = delivery.signatureFor(await webhookService.signingSecretsOf(subscription), TIMESTAMP, PAYLOAD);

    expect(header).toBe(`t=${TIMESTAMP},${signatureBy(secret)},${signatureBy(WEBHOOK_CURRENT_SECRET)}`);
    expect({ legacyCurrent: subscription.secretCiphertext, legacyPrevious: subscription.previousSecretCiphertext }).toEqual({
      legacyCurrent: LEGACY_WEBHOOK_CURRENT,
      legacyPrevious: null,
    });
  });

  it('should still rotate a subscription whose current secret no longer opens, without an overlap', async () => {
    const row = { current: legacySubscription({ secretCiphertext: LEGACY_WEBHOOK_PREVIOUS.replace('"iv":"', '"iv":"A'), previousSecretCiphertext: null }) };
    const { webhookService } = servicesOver(row);

    const { subscription, secret } = await webhookService.rotateSecret(3n);

    expect({ secrets: await webhookService.signingSecretsOf(subscription), expiresAt: subscription.previousSecretExpiresAt }).toEqual({ secrets: [secret], expiresAt: null });
  });

  it('should refuse to rotate when the secret is unreadable for a reason other than the row itself, such as a key missing from the keyring', async () => {
    const secretEnvelope = await sealerFor(K2).seal(WEBHOOK_CURRENT_SECRET, SEALED_COLUMNS.webhookSecret, 3n);
    const row = { current: legacySubscription({ secretEnvelope, previousSecretCiphertext: null }) };
    const { webhookService } = servicesOver(row);

    const error = await webhookService.rotateSecret(3n).catch((reason: unknown) => reason);

    expect({ unknownKey: AppError.is(error, CryptoErrorCode.UNKNOWN_KEY), unchanged: row.current.secretEnvelope }).toEqual({ unknownKey: true, unchanged: secretEnvelope });
  });

  it('should keep both secrets readable across a second rotation', async () => {
    const row = { current: legacySubscription() };
    const { webhookService } = servicesOver(row);

    const first = await webhookService.rotateSecret(3n);
    const second = await webhookService.rotateSecret(3n);

    expect(await webhookService.signingSecretsOf(second.subscription)).toEqual([second.secret, first.secret]);
  });
});
