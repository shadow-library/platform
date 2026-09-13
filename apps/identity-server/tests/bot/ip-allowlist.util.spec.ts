import { describe, expect, it } from 'bun:test';

import { normaliseCidr, normaliseIpAllowlist } from '@server/modules/identity/bot/ip-allowlist.util';

describe('ip-allowlist', () => {
  describe('normaliseCidr', () => {
    it('should accept IPv4 ranges and treat a bare address as a single host', () => {
      expect(normaliseCidr('203.0.113.0/24')).toBe('203.0.113.0/24');
      expect(normaliseCidr('198.51.100.14')).toBe('198.51.100.14/32');
      expect(normaliseCidr(' 0.0.0.0/0 ')).toBe('0.0.0.0/0');
    });

    it('should clear host bits beyond the prefix', () => {
      expect(normaliseCidr('203.0.113.77/24')).toBe('203.0.113.0/24');
      expect(normaliseCidr('2001:db8::1/32')).toBe('2001:db8::/32');
    });

    it('should canonicalise IPv6 per RFC 5952', () => {
      expect(normaliseCidr('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1/128');
      expect(normaliseCidr('::')).toBe('::/128');
      expect(normaliseCidr('1::/16')).toBe('1::/16');
      expect(normaliseCidr('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1/128');
      expect(normaliseCidr('2001:0:0:1:0:0:0:1')).toBe('2001:0:0:1::1/128');
      expect(normaliseCidr('::ffff:192.0.2.1/128')).toBe('::ffff:c000:201/128');
    });

    it('should reject anything that is not an address or range', () => {
      for (const entry of ['', 'localhost', '10.0.0.0/33', '::/129', '10.0.0.0/-1', '10.0.0.0/8/8', '10.0.0.256', '10.0.0.0/', 'fe80::1%eth0', '10.0.0.0/8a']) {
        expect(normaliseCidr(entry)).toBeNull();
      }
    });
  });

  describe('normaliseIpAllowlist', () => {
    it('should dedupe entries that normalise to the same range', () => {
      expect(normaliseIpAllowlist(['10.0.0.1/8', '10.0.0.0/8', '198.51.100.14', '198.51.100.14/32'])).toEqual(['10.0.0.0/8', '198.51.100.14/32']);
    });

    it('should refuse an invalid entry with BOT_012', () => {
      expect(() => normaliseIpAllowlist(['10.0.0.0/8', 'not-an-ip'])).toThrow(expect.objectContaining({ code: 'BOT_012' }));
    });

    it('should refuse more than 20 distinct entries with BOT_012', () => {
      const entries = Array.from({ length: 21 }, (_, index) => `10.0.${index}.0/24`);
      expect(() => normaliseIpAllowlist(entries)).toThrow(expect.objectContaining({ code: 'BOT_012' }));
      expect(normaliseIpAllowlist([...entries.slice(0, 20), entries[0]!])).toHaveLength(20);
    });
  });
});
