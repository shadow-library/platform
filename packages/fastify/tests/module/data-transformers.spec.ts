/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { INBUILT_TRANSFORMERS } from '@lib/module/data-transformers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('data-transformers', () => {
  describe('string:trim', () => {
    it('should trim whitespace', () => {
      expect(INBUILT_TRANSFORMERS['string:trim']('  hello  ')).toBe('hello');
      expect(INBUILT_TRANSFORMERS['string:trim']('\n\t hello \t\n')).toBe('hello');
      expect(INBUILT_TRANSFORMERS['string:trim']('')).toBe('');
    });
  });

  describe('email:normalize', () => {
    it('should trim and lowercase', () => {
      expect(INBUILT_TRANSFORMERS['email:normalize']('  Test@Example.COM  ')).toBe('test@example.com');
      expect(INBUILT_TRANSFORMERS['email:normalize']('\nUSER@EXAMPLE.COM\t')).toBe('user@example.com');
    });
  });

  describe('int:parse', () => {
    it('should parse base-10 integers', () => {
      expect(INBUILT_TRANSFORMERS['int:parse']('42')).toBe(42);
      expect(INBUILT_TRANSFORMERS['int:parse']('-12')).toBe(-12);
      expect(INBUILT_TRANSFORMERS['int:parse']('08')).toBe(8);
      expect(INBUILT_TRANSFORMERS['int:parse']('12px')).toBe(12);
      expect(Number.isNaN(INBUILT_TRANSFORMERS['int:parse']('not-a-number'))).toBe(true);
    });
  });

  describe('float:parse', () => {
    it('should parse floating point numbers', () => {
      expect(INBUILT_TRANSFORMERS['float:parse']('3.14')).toBeCloseTo(3.14);
      expect(INBUILT_TRANSFORMERS['float:parse']('-0.5')).toBeCloseTo(-0.5);
      expect(INBUILT_TRANSFORMERS['float:parse']('12.0')).toBeCloseTo(12);
      expect(Number.isNaN(INBUILT_TRANSFORMERS['float:parse']('nope'))).toBe(true);
    });
  });

  describe('bigint:parse', () => {
    it('should parse bigint strings', () => {
      expect(INBUILT_TRANSFORMERS['bigint:parse']('0')).toBe(0n);
      expect(INBUILT_TRANSFORMERS['bigint:parse']('9007199254740993')).toBe(9007199254740993n);
      expect(INBUILT_TRANSFORMERS['bigint:parse']('-10')).toBe(-10n);
    });

    it('should throw for invalid bigint strings', () => {
      expect(() => INBUILT_TRANSFORMERS['bigint:parse']('12.34')).toThrow();
      expect(() => INBUILT_TRANSFORMERS['bigint:parse']('not-a-bigint')).toThrow();
    });
  });

  describe('strip:null', () => {
    it('should return undefined for null input', () => {
      expect(INBUILT_TRANSFORMERS['strip:null'](null)).toBeUndefined();
    });

    it('should return the same value for non-null input', () => {
      expect(INBUILT_TRANSFORMERS['strip:null'](42)).toBe(42);
      expect(INBUILT_TRANSFORMERS['strip:null']('hello')).toBe('hello');
      expect(INBUILT_TRANSFORMERS['strip:null'](false)).toBe(false);
      expect(INBUILT_TRANSFORMERS['strip:null']({})).toStrictEqual({});
      expect(INBUILT_TRANSFORMERS['strip:null']([])).toStrictEqual([]);
      expect(INBUILT_TRANSFORMERS['strip:null'](undefined)).toBeUndefined();
    });
  });
});
