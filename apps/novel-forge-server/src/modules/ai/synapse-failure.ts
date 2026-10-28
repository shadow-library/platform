import { AppError, ErrorCode } from '@shadow-library/common';
import { isSynapseError, isSynapseErrorCode, type SynapseError, type SynapseErrorCode } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';
import { type Project } from '@server/database';

import { isTransientModelError, modelCallFailed } from './transient-model-error';

type FailureMapper = (error: SynapseError) => AppError;

const unservable: FailureMapper = error => AppErrorCode.AI_003.create(undefined, error);
const unknownTask: FailureMapper = error => AppErrorCode.AI_002.create(undefined, error);
const transient: FailureMapper = error => AppErrorCode.AI_007.create({ transient: true }, error);

const SYNAPSE_FAILURES: Partial<Record<SynapseErrorCode, FailureMapper>> = {
  SYN_ALIAS_UNAVAILABLE: unservable,
  SYN_NO_ELIGIBLE_MODEL: unservable,
  SYN_POLICY_DENIED: unservable,
  SYN_BUDGET_CALLS: error => AppErrorCode.AI_008.create(undefined, error),
  SYN_BUDGET_COST: error => AppErrorCode.AI_009.create(undefined, error),
  SYN_UNKNOWN_TASK: unknownTask,
  SYN_TASK_FORBIDDEN: unknownTask,
  SYN_NO_ACTIVE_CATALOG: transient,
  SYN_PROVIDERS_EXHAUSTED: transient,
  SYN_UPSTREAM_ERROR: transient,
  SYN_TIMEOUT: transient,
};

// Only an unrestricted call is strict on its content mode, so Synapse finding it no eligible model means the catalog routes no unrestricted model for it.
function mapSynapseFailure(error: unknown, contentMode?: Project.ContentMode): AppError | undefined {
  if (contentMode === 'unrestricted' && isSynapseError(error) && error.code === 'SYN_NO_ELIGIBLE_MODEL') return AppErrorCode.AI_024.create(undefined, error);
  if (AppError.is(error, ErrorCode.API_REQUEST_NETWORK_ERROR)) return AppErrorCode.AI_007.create({ transient: true }, error);
  if (!isSynapseError(error)) return undefined;
  const mapper = isSynapseErrorCode(error.code) ? SYNAPSE_FAILURES[error.code] : undefined;
  return mapper ? mapper(error) : AppErrorCode.AI_007.create({ transient: isTransientModelError(error) }, error);
}

/**
 * A Synapse refusal or an unreachable Synapse as the `AI_*` error the author and the durable jobs already understand; anything else, the hard
 * line's own refusal included, is returned as it came. Every `SynapseError` is internal, so letting one bubble would show only the generic face.
 */
export function fromSynapseFailure(error: unknown, contentMode?: Project.ContentMode): unknown {
  return mapSynapseFailure(error, contentMode) ?? error;
}

/** The router's give-up error: a failure that did not come from Synapse is still `AI_007`, flagged transient or not. */
export function synapseCallFailed(error: unknown, contentMode?: Project.ContentMode): AppError {
  return mapSynapseFailure(error, contentMode) ?? modelCallFailed(error);
}
