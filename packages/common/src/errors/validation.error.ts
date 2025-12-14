/**
 * Importing npm packages
 */
import { JsonObject } from 'type-fest';

/**
 * Importing user defined packages
 */
import { utils } from '@lib/utils';

import { AppError, AppErrorObject } from './app.error';
import { ErrorCode } from './error-code.error';

/**
 * Defining types
 */

export interface FieldError {
  field: string;
  msg: string;
  details?: JsonObject;
}

export interface ValidationErrorObject extends AppErrorObject {
  fields: FieldError[];
}

/**
 * Declaring the constants
 */

export class ValidationError extends AppError {
  private errors: FieldError[] = [];

  constructor();
  constructor(field: string, message: string, details?: JsonObject);
  constructor(field?: string, message?: string, details?: JsonObject) {
    super(ErrorCode.VALIDATION_ERROR);
    this.name = this.constructor.name;
    if (field && message) this.addFieldError(field, message, details);
  }

  static combineErrors(...errors: ValidationError[]): ValidationError {
    const combinedError = new ValidationError();
    for (const error of errors) {
      for (const fieldError of error.getErrors(true)) {
        combinedError.errors.push(fieldError);
      }
    }
    return combinedError;
  }

  addFieldError(field: string, msg: string, details?: JsonObject): ValidationError {
    const obj: FieldError = { field, msg };
    if (details) {
      obj.msg = utils.string.interpolate(msg, details);
      obj.details = details;
    }
    this.errors.push(obj);
    return this;
  }

  getErrors(withDetails = false): FieldError[] {
    if (withDetails) return [...this.errors];
    return this.errors.map(error => ({ field: error.field, msg: error.msg }));
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  getSummary(): string {
    const errors = this.getErrors();
    if (errors.length === 0) return 'Validation failed';
    else if (errors.length === 1) return `Validation failed for ${errors[0]?.field}`;

    const fields = errors.map(error => error.field);
    const lastField = fields.pop() as string;
    return `Validation failed for ${fields.join(', ')} and ${lastField}`;
  }

  override toObject(withDetails = false): ValidationErrorObject {
    return { ...super.toObject(), fields: this.getErrors(withDetails) };
  }
}
