import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';

describe('AppErrorCode', () => {
  it('should answer a plugin that is not on this deploy and one that is not enabled with the same status', () => {
    expect(AppErrorCode.PLG_001.status).toBe(404);
    expect(AppErrorCode.PLG_002.status).toBe(404);
  });

  it('should interpolate the awaiting-review count into TRN_005', () => {
    expect(AppErrorCode.TRN_005.create({ count: 3 }).message).toContain('3 glossary terms');
  });
});
