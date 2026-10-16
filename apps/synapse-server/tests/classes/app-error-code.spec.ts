import { describe, expect, it } from 'bun:test';

import { type ErrorCode } from '@shadow-library/common';
import { SYNAPSE_ERROR_CODES, type SynapseErrorCode } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';

const CONTRACT_STATUS: Record<SynapseErrorCode, number> = {
  SYN_UNKNOWN_TASK: 404,
  SYN_TASK_FORBIDDEN: 403,
  SYN_ALIAS_UNAVAILABLE: 422,
  SYN_NO_ELIGIBLE_MODEL: 422,
  SYN_BUDGET_CALLS: 429,
  SYN_BUDGET_COST: 429,
  SYN_POLICY_DENIED: 403,
  SYN_PROVIDERS_EXHAUSTED: 503,
  SYN_UPSTREAM_ERROR: 502,
  SYN_INVALID_REQUEST: 400,
  SYN_CATALOG_INVALID: 422,
  SYN_CATALOG_CONFLICT: 409,
  SYN_NO_ACTIVE_CATALOG: 503,
  SYN_TIMEOUT: 504,
  SYN_DUPLICATE_REQUEST: 409,
};

const catalog = AppErrorCode as unknown as Record<string, ErrorCode>;
const synapseKeys = Object.keys(AppErrorCode).filter(key => key.startsWith('SYN_'));

describe('AppErrorCode', () => {
  it('should declare exactly the SYN_* codes of the wire contract the client package exports', () => {
    expect([...synapseKeys].sort()).toEqual([...SYNAPSE_ERROR_CODES].sort());
  });

  it('should answer each SYN_* code with the HTTP status the contract assigns it', () => {
    for (const code of SYNAPSE_ERROR_CODES) expect({ code, status: catalog[code]?.status }).toEqual({ code, status: CONTRACT_STATUS[code] });
  });

  it('should put the same code on the wire as the catalog key it is declared under', () => {
    for (const key of synapseKeys) expect(catalog[key]?.code).toBe(key);
  });

  it('should expose every SYN_* message to the caller rather than masking it as an internal error', () => {
    for (const key of synapseKeys) expect({ key, isInternal: catalog[key]?.isInternal }).toEqual({ key, isInternal: false });
  });
});
