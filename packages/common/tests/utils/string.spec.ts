/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { utils } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('String Utils', () => {
  describe('interpolate', () => {
    it('should interpolate the string with the object', () => {
      expect(utils.string.interpolate('Hello {name}', { name: 'World' })).toBe('Hello World');
    });

    it('should convert the value to string if it is not a string', () => {
      expect(utils.string.interpolate('Hello {name}', { name: 123 })).toBe('Hello 123');
    });

    it('should return the string as it is if the key is not present in the object', () => {
      expect(utils.string.interpolate('Hello {name}', {})).toBe('Hello {name}');
    });

    it('should escape the curly braces if it is prefixed with a backslash', () => {
      expect(utils.string.interpolate('Hello \\{name}', { name: 'World' })).toBe('Hello {name}');
    });
  });

  describe('maskEmail', () => {
    it('should mask a simple email address', () => {
      expect(utils.string.maskEmail('user@example.com')).toBe('u**r@e*****e.com');
    });

    it('should mask an email with a short local part', () => {
      expect(utils.string.maskEmail('a@test.com')).toBe('*@t**t.com');
    });

    it('should mask an email with multiple domain parts', () => {
      expect(utils.string.maskEmail('john.doe@mail.example.com')).toBe('j******e@m**l.e*****e.com');
    });
  });

  describe('maskNumber', () => {
    it('should mask a number string with default keep values', () => {
      expect(utils.string.maskNumber('1234567890')).toBe('12******90');
    });

    it('should mask a number with custom keep start and end values', () => {
      expect(utils.string.maskNumber('1234567890', 3, 2)).toBe('123*****90');
    });

    it('should handle numeric input', () => {
      expect(utils.string.maskNumber(1234567890)).toBe('12******90');
    });

    it('should handle short numbers', () => {
      expect(utils.string.maskNumber('123')).toBe('***');
    });

    it('should handle single digit numbers', () => {
      expect(utils.string.maskNumber('5')).toBe('*');
    });

    it('should handle numbers with separators', () => {
      expect(utils.string.maskNumber('123-456-7890')).toBe('12*-***-**90');
    });

    it('should handle credit card format', () => {
      expect(utils.string.maskNumber('1234 5678 9012 3456', 4, 4)).toBe('1234 **** **** 3456');
    });

    it('should handle phone numbers', () => {
      expect(utils.string.maskNumber('+1-234-567-8900', 2, 2)).toBe('+1-2**-***-**00');
    });

    it('should handle numbers with no separators to preserve', () => {
      expect(utils.string.maskNumber('1234567890', 1, 1)).toBe('1********0');
    });
  });

  describe('maskWords', () => {
    it('should mask a single word', () => {
      expect(utils.string.maskWords('hello')).toBe('h***o');
    });

    it('should mask multiple words separated by spaces', () => {
      expect(utils.string.maskWords('hello world')).toBe('h***o w***d');
    });

    it('should handle single character words', () => {
      expect(utils.string.maskWords('a of cat dogs')).toBe('* ** *** d**s');
    });

    it('should handle empty string', () => {
      expect(utils.string.maskWords('')).toBe('');
    });

    it('should handle string with only spaces', () => {
      expect(utils.string.maskWords('   ')).toBe('   ');
    });

    it('should handle consecutive spaces', () => {
      expect(utils.string.maskWords('hello  world')).toBe('h***o  w***d');
    });

    it('should handle spaces at start and end', () => {
      expect(utils.string.maskWords(' hello  world ')).toBe(' h***o  w***d ');
    });
  });

  describe('mask', () => {
    describe('basic functionality', () => {
      it('should mask with default options', () => {
        expect(utils.string.mask('hello')).toBe('h***o');
      });

      it('should handle empty string', () => {
        expect(utils.string.mask('')).toBe('');
      });

      it('should handle single character', () => {
        expect(utils.string.mask('a')).toBe('a');
      });

      it('should handle two characters', () => {
        expect(utils.string.mask('ab')).toBe('ab');
      });

      it('should handle three characters with default keep values', () => {
        expect(utils.string.mask('abc')).toBe('a*c');
      });
    });

    describe('keepStart and keepEnd options', () => {
      it('should respect custom keepStart and keepEnd values', () => {
        expect(utils.string.mask('abcdefgh', { keepStart: 2, keepEnd: 2 })).toBe('ab****gh');
      });

      it('should handle keepStart larger than string length', () => {
        expect(utils.string.mask('abc', { keepStart: 5 })).toBe('abc');
      });

      it('should handle keepEnd larger than remaining length', () => {
        expect(utils.string.mask('abc', { keepEnd: 5 })).toBe('abc');
      });

      it('should handle zero keepStart and keepEnd', () => {
        expect(utils.string.mask('hello', { keepStart: 0, keepEnd: 0 })).toBe('*****');
      });
    });

    describe('maskChar option', () => {
      it('should use custom mask character', () => {
        expect(utils.string.mask('hello', { maskChar: '#' })).toBe('h###o');
      });

      it('should use multi-character mask', () => {
        expect(utils.string.mask('hello', { maskChar: 'XX' })).toBe('hXXXXXXo');
      });
    });

    describe('preserveSpaces option', () => {
      it('should preserve spaces by default', () => {
        expect(utils.string.mask('hello world')).toBe('h**** ****d');
      });

      it('should mask spaces when preserveSpaces is false', () => {
        expect(utils.string.mask('hello world', { preserveSpaces: false })).toBe('h*********d');
      });

      it('should handle multiple consecutive spaces', () => {
        expect(utils.string.mask('a  b', { preserveSpaces: true })).toBe('a  b');
      });
    });

    describe('preserveSeparators option', () => {
      it('should not preserve separators by default', () => {
        expect(utils.string.mask('hello-world.test')).toBe('h**************t');
      });

      it('should preserve all separators when true', () => {
        expect(utils.string.mask('hello-world.test', { preserveSeparators: true })).toBe('h****-*****.***t');
      });

      it('should preserve specific separators with array', () => {
        expect(utils.string.mask('hello-world.test', { preserveSeparators: ['-'] })).toBe('h****-*********t');
      });

      it('should preserve separators matching regex', () => {
        expect(utils.string.mask('hello-world.test', { preserveSeparators: /[-.]/ })).toBe('h****-*****.***t');
      });

      it('should handle complex separators', () => {
        expect(utils.string.mask('user@domain.com', { preserveSeparators: ['@', '.'] })).toBe('u***@******.**m');
      });
    });

    describe('minMask option', () => {
      it('should ensure minimum masked characters', () => {
        expect(utils.string.mask('abc', { minMask: 2 })).toBe('a**');
      });

      it('should not affect when enough characters are already masked', () => {
        expect(utils.string.mask('abcdefgh', { minMask: 2 })).toBe('a******h');
      });

      it('should work with preserveSpaces', () => {
        expect(utils.string.mask('a b c', { minMask: 3, preserveSpaces: true })).toBe('* * *');
      });

      it('should expand masking from center outward', () => {
        expect(utils.string.mask('abcde', { keepStart: 2, keepEnd: 2, minMask: 3 })).toBe('a***e');
      });
    });

    describe('complex scenarios', () => {
      it('should handle email-like strings with all options', () => {
        const result = utils.string.mask('user@example.com', {
          keepStart: 1,
          keepEnd: 4,
          preserveSeparators: ['@', '.'],
          maskChar: 'X',
        });
        expect(result).toBe('uXXX@XXXXXXX.com');
      });

      it('should handle phone numbers', () => {
        const result = utils.string.mask('+1-234-567-8900', {
          keepStart: 2,
          keepEnd: 4,
          preserveSeparators: ['+', '-'],
        });
        expect(result).toBe('+1-***-***-8900');
      });

      it('should handle credit card numbers', () => {
        const result = utils.string.mask('1234 5678 9012 3456', {
          keepStart: 4,
          keepEnd: 4,
          preserveSpaces: true,
        });
        expect(result).toBe('1234 **** **** 3456');
      });

      it('should handle mixed alphanumeric with special characters', () => {
        const result = utils.string.mask('ABC123!@#xyz789', {
          keepStart: 3,
          keepEnd: 3,
          preserveSeparators: ['!', '@', '#'],
        });
        expect(result).toBe('ABC***!@#***789');
      });
    });
  });
});
