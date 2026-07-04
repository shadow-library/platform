/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

/**
 * Declaring the constants
 */

describe('AppErrorCode', () => {
  it('should define project error codes', () => {
    expect(AppErrorCode.PRJ_001).toBeDefined();
    expect(AppErrorCode.PRJ_002).toBeDefined();
    expect(AppErrorCode.PRJ_003).toBeDefined();
  });

  it('should define AI error codes', () => {
    expect(AppErrorCode.AI_001).toBeDefined();
    expect(AppErrorCode.AI_002).toBeDefined();
    expect(AppErrorCode.AI_003).toBeDefined();
  });

  it('should define all domain error codes', () => {
    expect(AppErrorCode.SRC_001).toBeDefined();
    expect(AppErrorCode.CHP_001).toBeDefined();
    expect(AppErrorCode.PLN_001).toBeDefined();
    expect(AppErrorCode.DRF_001).toBeDefined();
    expect(AppErrorCode.DRF_002).toBeDefined();
    expect(AppErrorCode.DRF_003).toBeDefined();
    expect(AppErrorCode.FIN_001).toBeDefined();
    expect(AppErrorCode.CNT_001).toBeDefined();
    expect(AppErrorCode.ENT_001).toBeDefined();
  });
});
