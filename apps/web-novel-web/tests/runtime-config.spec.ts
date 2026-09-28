import { describe, expect, it } from 'bun:test';

import { resolveNovelForgeUrl } from '@/lib/runtime-config';

describe('resolveNovelForgeUrl', () => {
  it('should hide the Novel Forge links rather than fall back to production when no URL is configured', () => {
    expect(resolveNovelForgeUrl(undefined)).toBeNull();
    expect(resolveNovelForgeUrl('')).toBeNull();
  });

  it('should use the configured URL without its trailing slash', () => {
    expect(resolveNovelForgeUrl('https://novelforge.shadow-apps.test/')).toBe('https://novelforge.shadow-apps.test');
  });

  it('should keep a configured path prefix', () => {
    expect(resolveNovelForgeUrl('https://apps.example.test/novel-forge/')).toBe('https://apps.example.test/novel-forge');
  });

  it('should refuse a value that is not an http(s) URL', () => {
    expect(resolveNovelForgeUrl('novelforge.shadow-apps.test')).toBeNull();
    expect(resolveNovelForgeUrl('javascript:alert(1)')).toBeNull();
  });
});
