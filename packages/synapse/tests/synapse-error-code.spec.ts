import { describe, expect, it } from 'bun:test';

import { isSynapseErrorCode, SYNAPSE_ERROR_CODES } from '@shadow-library/synapse';

describe('isSynapseErrorCode', () => {
  it('should accept every code of the wire contract', () => {
    for (const code of SYNAPSE_ERROR_CODES) expect(isSynapseErrorCode(code)).toBe(true);
  });

  it('should reject a string outside the contract, including one that only shares the prefix or differs in case', () => {
    for (const value of ['SYN_', 'SYN_UNKNOWN', 'syn_timeout', 'SEC_003', 'IAM_001', '']) expect(isSynapseErrorCode(value)).toBe(false);
  });

  it('should reject inherited object keys a lookup by `in` would let through', () => {
    for (const value of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) expect(isSynapseErrorCode(value)).toBe(false);
  });

  it('should reject a value that is not a string', () => {
    for (const value of [undefined, null, 429, {}, ['SYN_TIMEOUT'], { code: 'SYN_TIMEOUT' }]) expect(isSynapseErrorCode(value)).toBe(false);
  });
});
