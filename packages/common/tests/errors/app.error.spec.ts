/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppError, ErrorCode } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

class TestErrorCode extends ErrorCode {
  static readonly CUSTOM = TestErrorCode.conflict('CUSTOM_ERROR', 'Custom error: {message}');
}

describe('AppError', () => {
  it('should create an instance of AppError', () => {
    const error = new AppError(ErrorCode.UNKNOWN);
    expect(error.name).toBe('AppError');
    expect(error).toBeInstanceOf(AppError);
  });

  it('should expose code, status and exposure from the key', () => {
    const error = new AppError(TestErrorCode.CUSTOM, { message: 'unauthorized' });
    expect(error.code).toBe('CUSTOM_ERROR');
    expect(error.status).toBe(409);
    expect(error.isInternal).toBe(false);
    expect(error.message).toBe('Custom error: unauthorized');
  });

  it('should carry the data and the cause', () => {
    const cause = new Error('root cause');
    const data = { message: 'Custom Error Message' };
    const error = new AppError(ErrorCode.UNKNOWN, data, cause);
    expect(error.data).toBe(data);
    expect(error.cause).toBe(cause);
  });

  it('should build free-form internal errors', () => {
    const error = AppError.internal('Session insert returned no row');
    expect(error.isInternal).toBe(true);
    expect(error.status).toBe(500);
    expect(error.message).toBe('Session insert returned no row');
  });

  it('should mask internal errors in the response shape but not in the log shape', () => {
    const internal = AppError.internal('secret detail');
    expect(internal.toObject()).toStrictEqual({ code: 'INTERNAL', message: 'secret detail', status: 500, isInternal: true });
    expect(internal.toResponse()).toStrictEqual({ code: 'UNKNOWN', message: 'Unknown Error' });

    const publicError = TestErrorCode.CUSTOM.create({ message: 'oops' });
    expect(publicError.toResponse()).toStrictEqual({ code: 'CUSTOM_ERROR', message: 'Custom error: oops' });
  });

  it('should keep an internal error masked after a serialization round-trip', () => {
    const internal = AppError.internal('secret detail');
    const rehydrated = AppError.from(internal.toObject());
    expect(rehydrated.isInternal).toBe(true);
    expect(rehydrated.status).toBe(500);
    expect(rehydrated.toResponse()).toStrictEqual({ code: 'UNKNOWN', message: 'Unknown Error' });
  });

  it('should fail closed to internal when the wire object omits exposure', () => {
    const rehydrated = AppError.from({ code: 'MYSTERY', message: 'no exposure flag' });
    expect(rehydrated.isInternal).toBe(true);
    expect(rehydrated.toResponse()).toStrictEqual({ code: 'UNKNOWN', message: 'Unknown Error' });
  });

  it('should narrow by key, by catalog, and by presence', () => {
    const error = TestErrorCode.CUSTOM.create({ message: 'oops' });
    expect(AppError.is(error)).toBe(true);
    expect(AppError.is(error, TestErrorCode.CUSTOM)).toBe(true);
    expect(AppError.is(error, ErrorCode.UNKNOWN)).toBe(false);
    expect(AppError.is(error, TestErrorCode)).toBe(true);
    expect(AppError.is(new Error('plain'))).toBe(false);
  });

  it('should match rehydrated errors by code string', () => {
    const original = TestErrorCode.CUSTOM.create({ message: 'oops' });
    const rehydrated = AppError.from({ ...original.toObject(), status: original.status });
    expect(AppError.is(rehydrated, TestErrorCode.CUSTOM)).toBe(true);
    expect(rehydrated.status).toBe(409);
  });
});
