/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AppError } from './app.error';

/**
 * Defining types
 */

type ErrorCodeClass<T extends ErrorCode> = new (code: string, message: string, status?: number, isInternal?: boolean) => T;

/**
 * Declaring the constants
 *
 * The single error catalog base: a key carries everything an error needs — machine code, message
 * with optional `{placeholder}` interpolation, category (encoded as the HTTP status, the most
 * widely understood numeric taxonomy; non-HTTP consumers map ranges to exit codes, retry policy,
 * or dialog kinds), and whether the message is internal-only. `create()`/`throw()` mean the key
 * alone decides what is thrown — packages declare catalogs by subclassing and using the factories.
 */

export class ErrorCode {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly status = 500,
    readonly isInternal = false,
  ) {}

  /*!
   * Factories — called on the catalog subclass (`AppErrorCode.notFound(...)`) so the key belongs
   * to its catalog; the trailing status parameter covers outliers like 410, 429 and 503.
   */

  /** The request is malformed or violates a business rule (400) */
  static badRequest<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 400): T {
    return new this(code, message, status, false);
  }

  /** The operation requires an established identity (401) */
  static unauthenticated<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 401): T {
    return new this(code, message, status, false);
  }

  /** The authenticated identity lacks the required privileges (403) */
  static forbidden<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 403): T {
    return new this(code, message, status, false);
  }

  /** The requested resource or identifier could not be located (404) */
  static notFound<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 404): T {
    return new this(code, message, status, false);
  }

  /** The operation conflicts with the current state of the target resource (409) */
  static conflict<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 409): T {
    return new this(code, message, status, false);
  }

  /** The input is syntactically correct but violates data constraints (422) */
  static validation<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 422): T {
    return new this(code, message, status, false);
  }

  /** A dependency failed transiently — retryable, unlike internal errors (503) */
  static unavailable<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 503): T {
    return new this(code, message, status, false);
  }

  /** A defect or broken invariant: the message stays in logs, responses show the generic face (500) */
  static internal<T extends ErrorCode>(this: ErrorCodeClass<T>, code: string, message: string, status = 500): T {
    return new this(code, message, status, true);
  }

  /** Builds this key's error; `data` interpolates the `{placeholders}` in the message */
  create(data?: Record<string, any>, cause?: unknown): AppError {
    return new AppError(this, data, cause);
  }

  /** Creates and throws — an expression of type `never`, usable in `??` fallbacks, ternaries, and brace-less catches */
  throw(data?: Record<string, any>, cause?: unknown): never {
    const error = this.create(data, cause);
    Error.captureStackTrace(error, this.throw);
    throw error;
  }

  /*!
   * Shared codes
   */

  /** Unknown error — the public face every internal error presents in responses */
  static readonly UNKNOWN = ErrorCode.internal('UNKNOWN', 'Unknown Error');
  /** Validation error */
  static readonly VALIDATION = ErrorCode.validation('VALIDATION_ERROR', 'Validation Error');
  /** Free-form internal invariants raised via `AppError.internal(reason)` */
  static readonly INTERNAL = ErrorCode.internal('INTERNAL', '{reason}');
  /** An outbound API request answered a failure status */
  static readonly API_REQUEST_FAILED = ErrorCode.internal('API_REQUEST_FAILED', 'API request failed with status code {status}');

  /*!
   * Flow Manager and Registry System Errors
   */

  /** The state '{targetState}' is not defined in the flow '{flowName}'. Check your flow definition. */
  static readonly UNKNOWN_FLOW_STATE = ErrorCode.internal('UNKNOWN_FLOW_STATE', "The state '{targetState}' is not defined in the flow '{flowName}'. Check your flow definition.");
  /** Invalid Transition: Cannot move from '{currentState}' to '{targetState}' in flow '{flowName}'. Allowed transitions: [{allowed}]. */
  static readonly INVALID_FLOW_TRANSITION = ErrorCode.internal(
    'INVALID_FLOW_TRANSITION',
    "Invalid transition: Cannot move from '{currentState}' to '{targetState}' in flow '{flowName}'. Allowed transitions: [{allowed}].",
  );
  /** Cannot initialize FlowManager. The provided definition is missing or invalid for flow '{flowName}'. */
  static readonly MISSING_FLOW_DEFINITION = ErrorCode.internal(
    'MISSING_FLOW_DEFINITION',
    "Cannot initialize FlowManager. The provided definition is missing or invalid for flow '{flowName}'.",
  );
  /** Transition prevented: The guard condition (onLeave) failed when trying to leave '{currentState}' for '{targetState}'. */
  static readonly FLOW_GUARD_VIOLATION = ErrorCode.internal(
    'FLOW_GUARD_VIOLATION',
    "Transition prevented: The guard condition (onLeave) failed when trying to leave '{currentState}' for '{targetState}'.",
  );
  /** Flow execution stopped because it exceeded the maximum recursion depth of {maxDepth}. Check for infinite loops in your actions. */
  static readonly FLOW_MAX_DEPTH_EXCEEDED = ErrorCode.internal(
    'FLOW_MAX_DEPTH_EXCEEDED',
    'Flow execution stopped because it exceeded the maximum recursion depth of {maxDepth}. Check for infinite loops in your actions.',
  );
  /** Cannot load snapshot. The snapshot is for flow '{snapshotFlowName}', but the manager was initialized with definition '{currentFlowName}'. */
  static readonly FLOW_SNAPSHOT_MISMATCH = ErrorCode.internal(
    'FLOW_SNAPSHOT_MISMATCH',
    "Cannot load snapshot. The snapshot is for flow '{snapshotFlowName}', but the manager was initialized with definition '{currentFlowName}'.",
  );
  /** Flow definition '{flowName}' is already registered in the FlowRegistry. Duplicate registrations are not allowed. */
  static readonly FLOW_ALREADY_REGISTERED = ErrorCode.internal(
    'FLOW_ALREADY_REGISTERED',
    "Flow definition '{flowName}' is already registered in the FlowRegistry. Duplicate registrations are not allowed.",
  );
  /** Flow definition '{flowName}' is not registered in the FlowRegistry. Cannot retrieve unregistered flows. */
  static readonly FLOW_NOT_REGISTERED = ErrorCode.internal(
    'FLOW_NOT_REGISTERED',
    "Flow definition '{flowName}' is not registered in the FlowRegistry. Cannot retrieve unregistered flows.",
  );
  /** Cannot restore FlowManager from snapshot. The provided snapshot is invalid or corrupted. */
  static readonly FLOW_SNAPSHOT_INVALID = ErrorCode.internal(
    'FLOW_SNAPSHOT_INVALID',
    "Failed to process flow snapshot. The snapshot is malformed or missing the required 'flowName' field.",
  );
}
