/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { ErrorCode } from '@lib/errors';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The flow domain's error catalog. These are programming errors — a malformed definition, an illegal
 * transition, a corrupt snapshot — so every entry is `internal`: the detail stays in logs while the
 * response shows the generic face. Kept beside the flow classes (not in the shared `ErrorCode` base) so
 * the catalog travels with its domain, per the error-creation standard.
 */

export class FlowErrorCode extends ErrorCode {
  /** The target state is not defined in the flow */
  static readonly UNKNOWN_FLOW_STATE = FlowErrorCode.internal(
    'UNKNOWN_FLOW_STATE',
    "The state '{targetState}' is not defined in the flow '{flowName}'. Check your flow definition.",
  );
  /** The requested transition is not allowed from the current state */
  static readonly INVALID_FLOW_TRANSITION = FlowErrorCode.internal(
    'INVALID_FLOW_TRANSITION',
    "Invalid transition: Cannot move from '{currentState}' to '{targetState}' in flow '{flowName}'. Allowed transitions: [{allowed}].",
  );
  /** An `onLeave` guard rejected the transition */
  static readonly FLOW_GUARD_VIOLATION = FlowErrorCode.internal(
    'FLOW_GUARD_VIOLATION',
    "Transition prevented: The guard condition (onLeave) failed when trying to leave '{currentState}' for '{targetState}'.",
  );
  /** Execution exceeded the maximum recursion depth — likely an infinite loop in an action */
  static readonly FLOW_MAX_DEPTH_EXCEEDED = FlowErrorCode.internal(
    'FLOW_MAX_DEPTH_EXCEEDED',
    'Flow execution stopped because it exceeded the maximum recursion depth of {maxDepth}. Check for infinite loops in your actions.',
  );
  /** The snapshot belongs to a different flow than the manager was initialized with */
  static readonly FLOW_SNAPSHOT_MISMATCH = FlowErrorCode.internal(
    'FLOW_SNAPSHOT_MISMATCH',
    "Cannot load snapshot. The snapshot is for flow '{snapshotFlowName}', but the manager was initialized with definition '{currentFlowName}'.",
  );
  /** A flow with this name is already registered */
  static readonly FLOW_ALREADY_REGISTERED = FlowErrorCode.internal(
    'FLOW_ALREADY_REGISTERED',
    "Flow definition '{flowName}' is already registered in the FlowRegistry. Duplicate registrations are not allowed.",
  );
  /** No flow with this name is registered */
  static readonly FLOW_NOT_REGISTERED = FlowErrorCode.internal(
    'FLOW_NOT_REGISTERED',
    "Flow definition '{flowName}' is not registered in the FlowRegistry. Cannot retrieve unregistered flows.",
  );
  /** The snapshot is malformed or missing its required `flowName` */
  static readonly FLOW_SNAPSHOT_INVALID = FlowErrorCode.internal(
    'FLOW_SNAPSHOT_INVALID',
    "Failed to process flow snapshot. The snapshot is malformed or missing the required 'flowName' field.",
  );
}
