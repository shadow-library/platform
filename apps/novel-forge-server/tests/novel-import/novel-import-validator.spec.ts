import { describe, expect, it } from 'bun:test';

import { type NovelBundle } from '@modules/novel-import/novel-import.dto';
import { validateNovelBundle } from '@modules/novel-import/novel-import.validator';

function buildBundle(): NovelBundle {
  return {
    format: 'novel-import',
    schemaVersion: 1,
    mode: 'source',
    novel: { title: 'The Lantern Keeper', synopsis: 'A retired lighthouse keeper strikes a bargain with the tide.' },
    volumes: [
      {
        ordinal: 1,
        title: 'The Quiet Coast',
        chapters: [
          { title: 'The Last Watch', content: 'Mira climbed the stair.' },
          { title: 'A Voice in the Foam', content: 'It answered.' },
        ],
      },
      { ordinal: 2, title: 'What the Tide Keeps', chapters: [{ title: 'The Debt', content: 'It wanted the lamp.' }] },
    ],
  };
}

function fieldsOf(bundle: NovelBundle): string[] {
  return validateNovelBundle(bundle).issues.map(i => i.field);
}

describe('validateNovelBundle', () => {
  it('should accept a valid bundle with no issues and derive contiguous chapter numbers in ordinal order', () => {
    const result = validateNovelBundle(buildBundle());
    expect(result.issues).toEqual([]);
    expect(result.chapters).toEqual([
      { number: 1, title: 'The Last Watch', content: 'Mira climbed the stair.' },
      { number: 2, title: 'A Voice in the Foam', content: 'It answered.' },
      { number: 3, title: 'The Debt', content: 'It wanted the lamp.' },
    ]);
  });

  it('should derive numbering by ordinal, not by array order', () => {
    const bundle = buildBundle();
    bundle.volumes.reverse(); // volume ordinal 2 now listed first in the array
    const result = validateNovelBundle(bundle);
    expect(result.issues).toEqual([]);
    expect(result.chapters.map(c => c.title)).toEqual(['The Last Watch', 'A Voice in the Foam', 'The Debt']);
  });

  it('should reject duplicate volume ordinals', () => {
    const bundle = buildBundle();
    bundle.volumes[1] = { ...bundle.volumes[1]!, ordinal: 1 };
    expect(fieldsOf(bundle)).toContain('volumes');
    expect(validateNovelBundle(bundle).issues.some(i => i.msg.includes('duplicate volume ordinal'))).toBe(true);
  });

  it('should reject non-contiguous volume ordinals', () => {
    const bundle = buildBundle();
    bundle.volumes[1] = { ...bundle.volumes[1]!, ordinal: 3 };
    expect(validateNovelBundle(bundle).issues.some(i => i.msg.includes('contiguous starting at 1'))).toBe(true);
  });

  it('should reject a cover referencing an unknown asset', () => {
    const bundle = buildBundle();
    bundle.novel.cover = 'front';
    expect(validateNovelBundle(bundle).issues).toEqual([{ field: 'novel.cover', msg: "cover references unknown asset 'front'" }]);
  });

  it('should accept a cover referencing a known asset', () => {
    const bundle = buildBundle();
    bundle.novel.cover = 'front';
    bundle.assets = [{ name: 'front', mimeType: 'image/jpeg', dataBase64: 'Zm9v' }];
    expect(validateNovelBundle(bundle).issues).toEqual([]);
  });

  it('should reject duplicate asset names', () => {
    const bundle = buildBundle();
    bundle.assets = [
      { name: 'front', mimeType: 'image/jpeg', dataBase64: 'Zm9v' },
      { name: 'front', mimeType: 'image/png', dataBase64: 'YmFy' },
    ];
    expect(validateNovelBundle(bundle).issues).toEqual([{ field: 'assets', msg: "duplicate asset name 'front'" }]);
  });

  it('should reject empty or whitespace-only chapter content beyond the DTO minLength', () => {
    const bundle = buildBundle();
    bundle.volumes[0]!.chapters[0]!.content = '   \n  ';
    expect(validateNovelBundle(bundle).issues).toEqual([{ field: 'volumes[0].chapters[0].content', msg: "chapter 'The Last Watch' has empty or whitespace-only content" }]);
  });

  it('should collect multiple independent issues in one pass', () => {
    const bundle = buildBundle();
    bundle.volumes[1] = { ...bundle.volumes[1]!, ordinal: 5 };
    bundle.novel.cover = 'missing';
    const issues = validateNovelBundle(bundle).issues;
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some(i => i.msg.includes('contiguous starting at 1'))).toBe(true);
    expect(issues.some(i => i.field === 'novel.cover')).toBe(true);
  });

  it('should reject a bundle whose total content exceeds the size sanity limit', () => {
    const bundle = buildBundle();
    // 49MB of chapter text — over the 48MB validator ceiling, comfortably under a slow-test threshold.
    bundle.volumes[0]!.chapters[0]!.content = 'a'.repeat(49 * 1024 * 1024);
    const issues = validateNovelBundle(bundle).issues;
    expect(issues.some(i => i.field === 'bundle' && i.msg.includes('exceeds the 48MB import limit'))).toBe(true);
  });
});
