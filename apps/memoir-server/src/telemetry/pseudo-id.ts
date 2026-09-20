/**
 * Importing npm packages
 */
import { createHmac } from 'node:crypto';

import { AppError, Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DEV_PSEUDO_ID_SECRET } from '@server/constants';

import { type PseudoId } from './events';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Keys every analytics event to an HMAC of the account id (ARCHITECTURE §23) instead of the id itself, so
 * an analytics sink never carries a value that round-trips to the account. Deterministic per account (the
 * same account always derives the same pseudo-id, so per-account aggregation still works downstream) and
 * irreversible without the secret.
 */
export function pseudoAccountId(accountId: bigint): PseudoId {
  const secret = Config.get('telemetry.pseudo-id-secret');
  return createHmac('sha256', secret).update(accountId.toString()).digest('hex') as PseudoId;
}

/**
 * Account ids are small sequential integers, so {@link pseudoAccountId} is only irreversible while its HMAC key
 * stays secret (§23). A production deployment refuses to boot with the key unset or still at the dev/test
 * default, rather than emit analytics a reader with log access could de-anonymize from a precomputed table.
 */
export function assertTelemetryPseudoIdSecret(secret: string): void {
  if (!Config.isProductionDeployment()) return;
  if (secret && secret !== DEV_PSEUDO_ID_SECRET) return;
  throw AppError.internal('telemetry.pseudo-id-secret is unset or still the dev default on a production deployment; the analytics pseudo-id would be reversible (§23)');
}
