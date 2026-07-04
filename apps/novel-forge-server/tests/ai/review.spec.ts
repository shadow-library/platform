/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { GenerationModule, GenerationService } from '@modules/generation';
import { AppErrorCode } from '@server/classes';

/**
 * Declaring the constants
 */

describe('GenerationModule error codes', () => {
  it('defines DRF_001 (draft not found)', () => {
    expect(AppErrorCode.DRF_001).toBeDefined();
    expect(AppErrorCode.DRF_001.getCode()).toBe('DRF_001');
  });

  it('defines DRF_002 (draft already final)', () => {
    expect(AppErrorCode.DRF_002).toBeDefined();
    expect(AppErrorCode.DRF_002.getCode()).toBe('DRF_002');
  });

  it('defines DRF_003 (unresolved contradiction blocks generate)', () => {
    expect(AppErrorCode.DRF_003).toBeDefined();
    expect(AppErrorCode.DRF_003.getCode()).toBe('DRF_003');
  });

  it('defines DRF_004 (draft not approved)', () => {
    expect(AppErrorCode.DRF_004).toBeDefined();
    expect(AppErrorCode.DRF_004.getCode()).toBe('DRF_004');
  });

  it('defines FIN_001 (cannot finalize out of order)', () => {
    expect(AppErrorCode.FIN_001).toBeDefined();
    expect(AppErrorCode.FIN_001.getCode()).toBe('FIN_001');
  });

  it('defines PLN_001 (plan not approved)', () => {
    expect(AppErrorCode.PLN_001).toBeDefined();
    expect(AppErrorCode.PLN_001.getCode()).toBe('PLN_001');
  });

  it('GenerationModule is a class constructor', () => {
    expect(typeof GenerationModule).toBe('function');
  });

  it('GenerationService is a class constructor', () => {
    expect(typeof GenerationService).toBe('function');
  });

  it('DRF_001 has NOT_FOUND error type', () => {
    expect(AppErrorCode.DRF_001.getType()).toBe('NOT_FOUND');
  });

  it('DRF_004 has CLIENT_ERROR error type', () => {
    expect(AppErrorCode.DRF_004.getType()).toBe('CLIENT_ERROR');
  });
});
