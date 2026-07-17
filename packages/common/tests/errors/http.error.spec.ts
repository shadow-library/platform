/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppError, ErrorCode, HttpErrorCode } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('HttpErrorCode', () => {
  it('should be an ErrorCode catalog', () => {
    expect(HttpErrorCode.S001).toBeInstanceOf(ErrorCode);
    expect(HttpErrorCode.S001).toBeInstanceOf(HttpErrorCode);
  });

  it('should map keys to the expected status and exposure', () => {
    expect(HttpErrorCode.S001.status).toBe(500);
    expect(HttpErrorCode.S001.isInternal).toBe(false); // generic, exposable message — mirrors the original catalog
    expect(HttpErrorCode.S002.status).toBe(404);
    expect(HttpErrorCode.S002.isInternal).toBe(false);
    expect(HttpErrorCode.S007.status).toBe(429);
  });

  it('should create and throw AppErrors that narrow to the catalog', () => {
    const error = HttpErrorCode.S009.create();
    expect(AppError.is(error, HttpErrorCode)).toBe(true);
    expect(AppError.is(error, HttpErrorCode.S009)).toBe(true);
    expect(() => HttpErrorCode.S004.throw()).toThrow(AppError);
  });
});
