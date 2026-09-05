import { describe, expect, it } from 'bun:test';

import { generatePublishToken } from '@server/common/publish-token';

describe('generatePublishToken', () => {
  it('should produce a 256-bit lowercase-hex token matching the reader binding format', () => {
    const token = generatePublishToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce a distinct token on every call', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generatePublishToken()));
    expect(tokens.size).toBe(100);
  });
});
