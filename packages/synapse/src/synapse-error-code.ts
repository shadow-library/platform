import { type SynapseErrorCode } from './synapse.types';

const KNOWN_CODES: Record<SynapseErrorCode, true> = {
  SYN_UNKNOWN_TASK: true,
  SYN_TASK_FORBIDDEN: true,
  SYN_ALIAS_UNAVAILABLE: true,
  SYN_NO_ELIGIBLE_MODEL: true,
  SYN_BUDGET_CALLS: true,
  SYN_BUDGET_COST: true,
  SYN_POLICY_DENIED: true,
  SYN_PROVIDERS_EXHAUSTED: true,
  SYN_UPSTREAM_ERROR: true,
  SYN_INVALID_REQUEST: true,
  SYN_CATALOG_INVALID: true,
  SYN_CATALOG_CONFLICT: true,
  SYN_NO_ACTIVE_CATALOG: true,
  SYN_TIMEOUT: true,
  SYN_DUPLICATE_REQUEST: true,
};

export const SYNAPSE_ERROR_CODES = Object.freeze(Object.keys(KNOWN_CODES) as SynapseErrorCode[]);

export function isSynapseErrorCode(value: unknown): value is SynapseErrorCode {
  return typeof value === 'string' && Object.hasOwn(KNOWN_CODES, value);
}
