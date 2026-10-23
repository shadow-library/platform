import { describe, expect, it } from 'bun:test';

import { isValidCidr, isValidIpAddress, validateCidr } from '../src/lib/cidr';

describe('isValidIpAddress', () => {
  it.each(['0.0.0.0', '255.255.255.255', '10.0.0.1', '192.168.1.254'])('should accept IPv4 %s', value => {
    expect(isValidIpAddress(value)).toBe(true);
  });

  it.each(['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.-4', '1.2.3.', '.1.2.3', '1..2.3', 'a.b.c.d', '', ' 1.2.3.4', '1.2.3.4 ', '1000.1.1.1'])(
    'should reject malformed IPv4 %p',
    value => {
      expect(isValidIpAddress(value)).toBe(false);
    },
  );

  it.each([
    '::',
    '::1',
    '2001:db8::1',
    '2001:db8:0:0:0:0:0:1',
    '1:2:3:4:5:6:7:8',
    '1:2:3:4:5:6:7::',
    '::2:3:4:5:6:7:8',
    'FE80::ABCD',
    '::ffff:192.168.1.1',
    '64:ff9b::192.0.2.33',
    '1:2:3:4:5:6:1.2.3.4',
    '1:2:3:4:5::1.2.3.4',
    '::1.2.3.4',
    '1::1.2.3.4',
  ])('should accept IPv6 %s', value => {
    expect(isValidIpAddress(value)).toBe(true);
  });

  it.each([
    ':1',
    '1:',
    ':::',
    '1:::2',
    '1::2::3',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7:8::',
    '::1:2:3:4:5:6:7:8',
    '12345::1',
    'g::1',
    'fe80::1%eth0',
    'fe80::1%1',
    '::ffff:256.0.0.1',
    '::ffff:1.2.3',
    '1:2:3:4:5:6:7:1.2.3.4',
    '1:2:3:4:5:6:1.2.3.4:7',
    '[::1]',
    '1.2.3.4::',
    '1:2::1.2.3.4:',
    '1.2.3.4:5::',
    '::1.2.3',
    '1::2::1.2.3.4',
  ])('should reject malformed IPv6 %p', value => {
    expect(isValidIpAddress(value)).toBe(false);
  });
});

describe('isValidCidr', () => {
  it('should accept a bare address without a prefix', () => {
    expect(isValidCidr('10.0.0.1')).toBe(true);
    expect(isValidCidr('::1')).toBe(true);
  });

  it('should trim surrounding whitespace', () => {
    expect(isValidCidr('  10.0.0.0/8  ')).toBe(true);
    expect(isValidCidr('  ')).toBe(false);
  });

  it.each(['10.0.0.0/0', '10.0.0.0/8', '10.0.0.0/32'])('should accept IPv4 prefix within bounds %s', value => {
    expect(isValidCidr(value)).toBe(true);
  });

  it.each(['10.0.0.0/33', '10.0.0.0/128', '10.0.0.0/999'])('should reject IPv4 prefix above 32 %s', value => {
    expect(isValidCidr(value)).toBe(false);
  });

  it.each(['::/0', '2001:db8::/32', '2001:db8::/64', '::1/128', '::ffff:1.2.3.4/96'])('should accept IPv6 prefix within bounds %s', value => {
    expect(isValidCidr(value)).toBe(true);
  });

  it.each(['::1/129', '::/200', '::/999'])('should reject IPv6 prefix above 128 %s', value => {
    expect(isValidCidr(value)).toBe(false);
  });

  it.each(['10.0.0.0/', '10.0.0.0/-1', '10.0.0.0/+8', '10.0.0.0/8.5', '10.0.0.0/abc', '10.0.0.0/1000', '10.0.0.0/ 8', '10.0.0.0/8/8', '::1/'])(
    'should reject non-numeric or oversize prefix text %p',
    value => {
      expect(isValidCidr(value)).toBe(false);
    },
  );

  it('should accept leading zeros in the prefix up to three digits', () => {
    expect(isValidCidr('10.0.0.0/008')).toBe(true);
    expect(isValidCidr('10.0.0.0/033')).toBe(false);
  });

  it('should reject a prefix on an invalid address', () => {
    expect(isValidCidr('999.0.0.0/8')).toBe(false);
    expect(isValidCidr('/8')).toBe(false);
    expect(isValidCidr('1.2.3.4::/64')).toBe(false);
    expect(isValidCidr('fe80::1%eth0/64')).toBe(false);
  });
});

describe('validateCidr', () => {
  it('should return true for a valid value', () => {
    expect(validateCidr('10.0.0.0/8')).toBe(true);
  });

  it('should return the message for an invalid value', () => {
    expect(validateCidr('nope')).toBe('Must be a valid IP address or CIDR range');
  });
});
