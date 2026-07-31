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

class CatalogErrorCode extends ErrorCode {
  static readonly NOT_FOUND_001 = CatalogErrorCode.notFound('NF_001', 'Thing not found');
  static readonly GONE_001 = CatalogErrorCode.notFound('GONE_001', 'Thing expired', 410);
  static readonly RATE_001 = CatalogErrorCode.badRequest('RATE_001', 'Too many requests', 429);
  static readonly DOWN_001 = CatalogErrorCode.unavailable('DOWN_001', 'Dependency unreachable');
  static readonly BUG_001 = CatalogErrorCode.internal('BUG_001', "Insert returned no row for '{id}'");
}

describe('ErrorCode', () => {
  it('should expose code, message and status as properties', () => {
    expect(ErrorCode.UNKNOWN.code).toBe('UNKNOWN');
    expect(ErrorCode.UNKNOWN.message).toBe('Unknown Error');
    expect(ErrorCode.UNKNOWN.status).toBe(500);
    expect(ErrorCode.UNKNOWN.isInternal).toBe(true);
  });

  it('should assign category statuses through the factories', () => {
    expect(CatalogErrorCode.NOT_FOUND_001.status).toBe(404);
    expect(CatalogErrorCode.RATE_001.status).toBe(429);
    expect(CatalogErrorCode.DOWN_001.status).toBe(503);
    expect(CatalogErrorCode.GONE_001.status).toBe(410);
    expect(CatalogErrorCode.BUG_001.isInternal).toBe(true);
  });

  it('should mint keys belonging to their catalog', () => {
    expect(CatalogErrorCode.NOT_FOUND_001).toBeInstanceOf(CatalogErrorCode);
    expect(ErrorCode.UNKNOWN).not.toBeInstanceOf(CatalogErrorCode);
  });

  it('should create and throw AppErrors from the key', () => {
    const error = CatalogErrorCode.BUG_001.create({ id: '42' });
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe("Insert returned no row for '42'");
    expect(() => CatalogErrorCode.NOT_FOUND_001.throw()).toThrow('Thing not found');
  });

  it('should attach the cause when provided', () => {
    const cause = new Error('io failure');
    const error = CatalogErrorCode.DOWN_001.create(undefined, cause);
    expect(error.cause).toBe(cause);
  });

  it('should work as a never-typed expression in nullish fallbacks', () => {
    const resolve = (value?: string): string => value ?? CatalogErrorCode.NOT_FOUND_001.throw();
    expect(resolve('present')).toBe('present');
    expect(() => resolve()).toThrow(AppError);
  });
});
