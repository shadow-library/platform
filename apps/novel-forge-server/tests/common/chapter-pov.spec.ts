import { describe, expect, it } from 'bun:test';

import { briefMatchesPov, type ChapterPovBrief, resolveChapterPov } from '@server/common';

function brief(pov: string | null, scenePovs: (string | null)[] = []): ChapterPovBrief {
  return { pov, scenes: scenePovs.map(scenePov => ({ summary: 'x', pov: scenePov })) };
}

describe('resolveChapterPov', () => {
  it('should use the brief pov when set', () => {
    expect(resolveChapterPov(brief('mara'))).toBe('mara');
  });

  it('should fall back to the first pooled scene pov when the brief has none', () => {
    expect(resolveChapterPov(brief(null, [null, 'ren']))).toBe('ren');
  });

  it('should return null when neither the brief nor any scene names a pov', () => {
    expect(resolveChapterPov(brief(null))).toBeNull();
    expect(resolveChapterPov(brief(null, [null]))).toBeNull();
  });

  it('should return null for an undefined brief', () => {
    expect(resolveChapterPov(undefined)).toBeNull();
  });
});

describe('briefMatchesPov', () => {
  it('should match the brief pov directly', () => {
    expect(briefMatchesPov(brief('mara'), 'mara')).toBe(true);
  });

  it('should match a pooled scene pov even when the brief pov differs', () => {
    expect(briefMatchesPov(brief('ren', ['mara']), 'mara')).toBe(true);
  });

  it('should not match a pov absent from the brief and every scene', () => {
    expect(briefMatchesPov(brief('ren', ['lio']), 'mara')).toBe(false);
  });
});
