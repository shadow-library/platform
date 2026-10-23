import { createHmac } from 'node:crypto';

import { AppError, Config } from '@shadow-library/common';

import { DEV_PSEUDO_ID_SECRET } from '@server/constants';

import { type PseudoId } from './events';

/** HMAC of the account id instead of the id itself: deterministic per account so downstream aggregation works, irreversible without the secret. */
export function pseudoAccountId(accountId: bigint): PseudoId {
  const secret = Config.get('telemetry.pseudo-id-secret');
  return createHmac('sha256', secret).update(accountId.toString()).digest('hex') as PseudoId;
}

/**
 * Account ids are small sequential integers, so the pseudo-id is irreversible only while its HMAC key stays secret; production refuses to boot
 * with it unset or at the dev/test default.
 */
export function assertTelemetryPseudoIdSecret(secret: string): void {
  if (!Config.isProductionDeployment()) return;
  if (secret && secret !== DEV_PSEUDO_ID_SECRET) return;
  throw AppError.internal('telemetry.pseudo-id-secret is unset or still the dev default on a production deployment; the analytics pseudo-id would be reversible (§23)');
}
