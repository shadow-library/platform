import { ErrorCode } from '@lib/errors';

/** Programming errors only, so every entry is `internal`: detail stays in logs and responses show the generic face. */
export class FlowErrorCode extends ErrorCode {
  static readonly UNKNOWN_FLOW_STATE = FlowErrorCode.internal(
    'UNKNOWN_FLOW_STATE',
    "The state '{targetState}' is not defined in the flow '{flowName}'. Check your flow definition.",
  );
  static readonly INVALID_FLOW_TRANSITION = FlowErrorCode.internal(
    'INVALID_FLOW_TRANSITION',
    "Invalid transition: Cannot move from '{currentState}' to '{targetState}' in flow '{flowName}'. Allowed transitions: [{allowed}].",
  );
  static readonly FLOW_GUARD_VIOLATION = FlowErrorCode.internal(
    'FLOW_GUARD_VIOLATION',
    "Transition prevented: The guard condition (onLeave) failed when trying to leave '{currentState}' for '{targetState}'.",
  );
  static readonly FLOW_MAX_DEPTH_EXCEEDED = FlowErrorCode.internal(
    'FLOW_MAX_DEPTH_EXCEEDED',
    'Flow execution stopped because it exceeded the maximum recursion depth of {maxDepth}. Check for infinite loops in your actions.',
  );
  static readonly FLOW_SNAPSHOT_MISMATCH = FlowErrorCode.internal(
    'FLOW_SNAPSHOT_MISMATCH',
    "Cannot load snapshot. The snapshot is for flow '{snapshotFlowName}', but the manager was initialized with definition '{currentFlowName}'.",
  );
  static readonly FLOW_ALREADY_REGISTERED = FlowErrorCode.internal(
    'FLOW_ALREADY_REGISTERED',
    "Flow definition '{flowName}' is already registered in the FlowRegistry. Duplicate registrations are not allowed.",
  );
  static readonly FLOW_NOT_REGISTERED = FlowErrorCode.internal(
    'FLOW_NOT_REGISTERED',
    "Flow definition '{flowName}' is not registered in the FlowRegistry. Cannot retrieve unregistered flows.",
  );
  static readonly FLOW_SNAPSHOT_INVALID = FlowErrorCode.internal(
    'FLOW_SNAPSHOT_INVALID',
    "Failed to process flow snapshot. The snapshot is malformed or missing the required 'flowName' field.",
  );
}
