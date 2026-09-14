import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';

describe('AppErrorCode', () => {
  it('should define project error codes', () => {
    expect(AppErrorCode.PRJ_001).toBeDefined();
    expect(AppErrorCode.PRJ_003).toBeDefined();
  });

  it('should define AI error codes', () => {
    expect(AppErrorCode.AI_001).toBeDefined();
    expect(AppErrorCode.AI_002).toBeDefined();
    expect(AppErrorCode.AI_003).toBeDefined();
  });

  it('should define all domain error codes', () => {
    expect(AppErrorCode.SRC_002).toBeDefined();
    expect(AppErrorCode.CHP_001).toBeDefined();
    expect(AppErrorCode.PLN_001).toBeDefined();
    expect(AppErrorCode.DRF_001).toBeDefined();
    expect(AppErrorCode.DRF_002).toBeDefined();
    expect(AppErrorCode.DRF_003).toBeDefined();
    expect(AppErrorCode.FIN_001).toBeDefined();
    expect(AppErrorCode.CNT_001).toBeDefined();
    expect(AppErrorCode.ENT_001).toBeDefined();
  });

  it('should define refinement error codes', () => {
    expect(AppErrorCode.ARC_001).toBeDefined();
    expect(AppErrorCode.ARC_002).toBeDefined();
    expect(AppErrorCode.ARC_003).toBeDefined();
    expect(AppErrorCode.ARC_004).toBeDefined();
    expect(AppErrorCode.CHT_001).toBeDefined();
    expect(AppErrorCode.CHT_002).toBeDefined();
    expect(AppErrorCode.CHT_003).toBeDefined();
    expect(AppErrorCode.RFN_001).toBeDefined();
    expect(AppErrorCode.RFN_002).toBeDefined();
    expect(AppErrorCode.RFN_003).toBeDefined();
    expect(AppErrorCode.RFN_004).toBeDefined();
    expect(AppErrorCode.RFN_005).toBeDefined();
    expect(AppErrorCode.PRM_001).toBeDefined();
  });

  it('should define interstitial chapter error codes', () => {
    expect(AppErrorCode.CHP_003.code).toBe('CHP_003');
    expect(AppErrorCode.CHP_003.status).toBe(400);
    expect(AppErrorCode.CHP_004.code).toBe('CHP_004');
    expect(AppErrorCode.CHP_004.status).toBe(409);
    expect(AppErrorCode.CHP_005.code).toBe('CHP_005');
    expect(AppErrorCode.CHP_005.status).toBe(400);
    expect(AppErrorCode.CHP_006.code).toBe('CHP_006');
    expect(AppErrorCode.CHP_006.status).toBe(400);
  });

  it('should define curated ingest error codes', () => {
    expect(AppErrorCode.ING_001.status).toBe(404);
    expect(AppErrorCode.ING_002.status).toBe(409);
    expect(AppErrorCode.ING_003.status).toBe(409);
  });

  it('should answer a plugin that is not on this deploy and one that is not enabled with the same status', () => {
    expect(AppErrorCode.PLG_001.status).toBe(404);
    expect(AppErrorCode.PLG_002.status).toBe(404);
  });

  it('should define plugin error codes', () => {
    expect(AppErrorCode.PLG_003.status).toBe(400);
    expect(AppErrorCode.PLG_004.status).toBe(409);
  });

  it('should define translation error codes', () => {
    expect(AppErrorCode.TRN_001.status).toBe(404);
    expect(AppErrorCode.TRN_002.status).toBe(404);
    expect(AppErrorCode.TRN_003.status).toBe(400);
    expect(AppErrorCode.TRN_004.status).toBe(409);
    expect(AppErrorCode.TRN_005.status).toBe(400);
    expect(AppErrorCode.TRN_006.status).toBe(409);
    expect(AppErrorCode.TRN_007.status).toBe(404);
    expect(AppErrorCode.TRN_008.status).toBe(400);
    expect(AppErrorCode.TRN_009.status).toBe(409);
    expect(AppErrorCode.TRN_010.status).toBe(409);
    expect(AppErrorCode.TRN_011.status).toBe(409);
    expect(AppErrorCode.TRN_012.status).toBe(404);
  });

  it('should interpolate the awaiting-review count into TRN_005', () => {
    expect(AppErrorCode.TRN_005.create({ count: 3 }).message).toContain('3 glossary terms');
  });

  it('should define transform reforge error codes', () => {
    expect(AppErrorCode.REF_004.status).toBe(404);
    expect(AppErrorCode.REF_005.status).toBe(400);
    expect(AppErrorCode.REF_006.status).toBe(400);
    expect(AppErrorCode.REF_007.status).toBe(404);
    expect(AppErrorCode.REF_008.status).toBe(400);
    expect(AppErrorCode.REF_009.status).toBe(400);
    expect(AppErrorCode.REF_010.status).toBe(409);
  });
});
