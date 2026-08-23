/**
 * Importing npm packages
 */
import { createHmac } from 'node:crypto';

import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
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
