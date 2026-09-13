import { describe, expect, it } from 'bun:test';

import { JA_PROFILE, KO_PROFILE, LATIN_PROFILE, scriptProfileFor, scriptRatio, ZH_PROFILE } from '@modules/translation';

describe('scriptProfileFor', () => {
  it('should resolve exact language tags to their profile', () => {
    expect(scriptProfileFor('zh')).toBe(ZH_PROFILE);
    expect(scriptProfileFor('ja')).toBe(JA_PROFILE);
    expect(scriptProfileFor('ko')).toBe(KO_PROFILE);
  });

  it('should match on the primary language subtag, case-insensitively', () => {
    expect(scriptProfileFor('zh-Hant')).toBe(ZH_PROFILE);
    expect(scriptProfileFor('ZH-CN')).toBe(ZH_PROFILE);
    expect(scriptProfileFor('ja-JP')).toBe(JA_PROFILE);
  });

  it('should fall back to the Latin profile for null, undefined, or unknown languages', () => {
    expect(scriptProfileFor(null)).toBe(LATIN_PROFILE);
    expect(scriptProfileFor(undefined)).toBe(LATIN_PROFILE);
    expect(scriptProfileFor('en')).toBe(LATIN_PROFILE);
    expect(scriptProfileFor('fr-CA')).toBe(LATIN_PROFILE);
  });
});

describe('scriptRatio', () => {
  it('should return 0 for empty text', () => {
    expect(scriptRatio('', ZH_PROFILE)).toBe(0);
  });

  it('should return close to 1 for text entirely in the profile script', () => {
    expect(scriptRatio('叶辰走进了大殿', ZH_PROFILE)).toBe(1);
  });

  it('should return 0 when the text has letters but none in the profile script', () => {
    expect(scriptRatio('Ye Chen walked into the hall', ZH_PROFILE)).toBe(0);
  });

  it('should return a fraction for mixed-script text', () => {
    const ratio = scriptRatio('叶辰 walked into the hall', ZH_PROFILE);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });

  it('should score hangul text highly against the Korean profile', () => {
    expect(scriptRatio('안녕하세요 여러분', KO_PROFILE)).toBe(1);
  });
});
