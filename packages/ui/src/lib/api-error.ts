/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface ErrorField {
  field: string;
  msg: string;
}

export interface ErrorResponse {
  code: string;
  type: string;
  message: string;
  fields?: ErrorField[];
}

/**
 * Declaring the constants
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly fields?: ErrorField[];

  constructor(status: number, body: ErrorResponse) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.type = body.type;
    this.fields = body.fields;
  }
}
