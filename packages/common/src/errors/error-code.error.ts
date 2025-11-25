/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export enum ErrorType {
  /*!
   * Below error types need to be removed in the next major version
   */

  CLIENT_ERROR = 'CLIENT_ERROR',
  HTTP_ERROR = 'HTTP_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVER_ERROR = 'SERVER_ERROR',

  /** The operation failed because the request syntax or command structure was malformed */
  INVALID_REQUEST = 'INVALID_REQUEST',

  /** An external dependency (network, database, file system, API) failed to complete the operation */
  IO_ERROR = 'IO_ERROR',

  /** The requested resource or identifier could not be located in the system */
  NOT_FOUND = 'NOT_FOUND',

  /** The operation requires an established identity, but no valid credentials were provided */
  UNAUTHENTICATED = 'UNAUTHENTICATED',

  /** The authenticated identity lacks the necessary privileges or roles to perform this operation */
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  /** The input parameters are syntactically correct but violate specific business rules or data constraints */
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  /** An unexpected condition, configuration defect, or logic bug prevented the system from fulfilling the request */
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  /** The operation is valid in isolation but cannot be performed due to the current state of the target resource */
  CONFLICT = 'CONFLICT',
}

/**
 * Declaring the constants
 */

export class ErrorCode {
  protected constructor(
    private readonly code: string,
    private readonly type: ErrorType,
    private readonly msg: string,
  ) {}

  getCode(): string {
    return this.code;
  }

  getType(): ErrorType {
    return this.type;
  }

  getMessage(): string {
    return this.msg;
  }

  /** Unknown Error */
  static readonly UNKNOWN = new ErrorCode('UNKNOWN', ErrorType.SERVER_ERROR, 'Unknown Error');
  /** Unexpected Error */
  static readonly UNEXPECTED = new ErrorCode('UNEXPECTED', ErrorType.SERVER_ERROR, 'Unexpected Error');
  /** Validation Error */
  static readonly VALIDATION_ERROR = new ErrorCode('VALIDATION_ERROR', ErrorType.VALIDATION_ERROR, 'Validation Error');

  /**
   * Flow Manager and Registry System Errors
   */

  /** The state '{targetState}' is not defined in the flow '{flowName}'. Check your flow definition. */
  static readonly UNKNOWN_FLOW_STATE = new ErrorCode(
    'UNKNOWN_FLOW_STATE',
    ErrorType.INTERNAL_ERROR,
    "The state '{targetState}' is not defined in the flow '{flowName}'. Check your flow definition.",
  );
  /** Invalid Transition: Cannot move from '{currentState}' to '{targetState}' in flow '{flowName}'. Allowed transitions: [{allowed}]. */
  static readonly INVALID_FLOW_TRANSITION = new ErrorCode(
    'INVALID_FLOW_TRANSITION',
    ErrorType.CONFLICT,
    "Invalid transition: Cannot move from '{currentState}' to '{targetState}' in flow '{flowName}'. Allowed transitions: [{allowed}].",
  );
  /** Cannot initialize FlowManager. The provided definition is missing or invalid for flow '{flowName}'. */
  static readonly MISSING_FLOW_DEFINITION = new ErrorCode(
    'MISSING_FLOW_DEFINITION',
    ErrorType.INTERNAL_ERROR,
    "Cannot initialize FlowManager. The provided definition is missing or invalid for flow '{flowName}'.",
  );
  /** Transition prevented: The guard condition (onLeave) failed when trying to leave '{currentState}' for '{targetState}'. */
  static readonly FLOW_GUARD_VIOLATION = new ErrorCode(
    'FLOW_GUARD_VIOLATION',
    ErrorType.VALIDATION_ERROR,
    "Transition prevented: The guard condition (onLeave) failed when trying to leave '{currentState}' for '{targetState}'.",
  );
  /** Flow execution stopped because it exceeded the maximum recursion depth of {maxDepth}. Check for infinite loops in your actions. */
  static readonly FLOW_MAX_DEPTH_EXCEEDED = new ErrorCode(
    'FLOW_MAX_DEPTH_EXCEEDED',
    ErrorType.INTERNAL_ERROR,
    'Flow execution stopped because it exceeded the maximum recursion depth of {maxDepth}. Check for infinite loops in your actions.',
  );
  /** Cannot load snapshot. The snapshot is for flow '{snapshotFlowName}', but the manager was initialized with definition '{currentFlowName}'. */
  static readonly FLOW_SNAPSHOT_MISMATCH = new ErrorCode(
    'FLOW_SNAPSHOT_MISMATCH',
    ErrorType.INTERNAL_ERROR,
    "Cannot load snapshot. The snapshot is for flow '{snapshotFlowName}', but the manager was initialized with definition '{currentFlowName}'.",
  );
  static readonly FLOW_ALREADY_REGISTERED = new ErrorCode(
    'FLOW_ALREADY_REGISTERED',
    ErrorType.CONFLICT,
    "Flow definition '{flowName}' is already registered in the FlowRegistry. Duplicate registrations are not allowed.",
  );
  /** Flow definition '{flowName}' is not registered in the FlowRegistry. Cannot retrieve unregistered flows. */
  static readonly FLOW_NOT_REGISTERED = new ErrorCode(
    'FLOW_NOT_REGISTERED',
    ErrorType.NOT_FOUND,
    "Flow definition '{flowName}' is not registered in the FlowRegistry. Cannot retrieve unregistered flows.",
  );
  /** Cannot restore FlowManager from snapshot. The provided snapshot is invalid or corrupted. */
  static readonly FLOW_SNAPSHOT_INVALID = new ErrorCode(
    'FLOW_SNAPSHOT_INVALID',
    ErrorType.INTERNAL_ERROR,
    "Failed to process flow snapshot. The snapshot is malformed or missing the required 'flowName' field.",
  );
}
