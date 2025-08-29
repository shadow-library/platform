/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { objectUtils } from './object';

/**
 * Defining types
 */

export interface MaskOptions {
  /** Character to use for masking. Default: '*' */
  maskChar?: string;

  /** How many characters to keep at the start and end (of the whole string). */
  keepStart?: number; // Default: 1
  keepEnd?: number; // Default: 1

  /** Preserve spaces literally? Default: true */
  preserveSpaces?: boolean;

  /**
   * Preserve “separators” (non-alphanumeric punctuation like .-_/() etc)?
   * - true  → preserve all non-alphanumeric chars (except space, which is controlled by preserveSpaces)
   * - false → do not preserve (mask like normal)
   * - RegExp | string[] → only preserve matches of the regex or chars in the list
   * Default: false
   */
  preserveSeparators?: boolean | RegExp | string[];

  /** Ensure at least this many masked chars (helps with very short strings). Default: 0 */
  minMask?: number;
}

/**
 * Declaring the constants
 */
const MASK_CHAR = '*';

class StringUtils {
  /**
   * Interpolates the given string with the given object
   */
  interpolate(str: string, obj: Record<string, any>): string {
    return str.replace(/\\?\{([^{}]+)\}/g, (match, key) => {
      if (match.startsWith('\\')) return match.slice(1);
      const value = objectUtils.getByPath(obj, key.trim());
      return value?.toString() ?? match;
    });
  }

  maskEmail(email: string): string {
    let maskedEmail = '';
    const [localPart, domain] = email.split('@') as [string, string | undefined];
    maskedEmail += this.maskWords(localPart) + '@';
    if (domain) {
      const parts = domain.split('.');
      for (let index = 0; index < parts.length - 1; index++) maskedEmail += this.maskWords(parts[index] as string) + '.';
      maskedEmail += parts[parts.length - 1] as string;
    }
    return maskedEmail;
  }

  maskNumber(num: string | number, keepStart = 2, keepEnd = 2): string {
    if (typeof num === 'number') num = num.toString();
    let maskedNum = '';
    const n = num.length;
    if (n <= keepStart + keepEnd) {
      for (let i = 0; i < n; i++) maskedNum += MASK_CHAR;
      return maskedNum;
    }

    let totalDigits = 0;
    for (let i = 0; i < n; i++) {
      const c = num.charCodeAt(i);
      if (c >= 48 && c <= 57) totalDigits++;
    }

    let digitIndex = 0;
    for (let i = 0; i < n; i++) {
      const ch = num[i] as string;
      const c = ch.charCodeAt(0);
      if (c >= 48 && c <= 57) {
        maskedNum += digitIndex < keepStart || digitIndex >= totalDigits - keepEnd ? ch : MASK_CHAR;
        digitIndex++;
      } else maskedNum += ch;
    }

    return maskedNum;
  }

  maskWords(input: string): string {
    const parts = input.split(' ');
    let output = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as string;
      if (!part) output += '';
      if (part.length <= 3) output += '*'.repeat(part.length);
      else {
        output += part[0];
        for (let j = 1; j < part.length - 1; j++) output += '*';
        output += part[part.length - 1];
      }
      if (i < parts.length - 1) output += ' ';
    }
    return output;
  }

  mask(input: string, opts: MaskOptions = {}): string {
    if (!input) return input;
    const n = input.length;
    const { maskChar = MASK_CHAR, keepStart = 1, keepEnd = 1, preserveSpaces = true, preserveSeparators = false, minMask = 0 } = opts;

    const head = Math.max(0, Math.min(keepStart, n));
    const tail = Math.max(0, Math.min(keepEnd, n - head));
    const midStart = head;
    const midEnd = n - tail;

    if (midStart >= midEnd) return input;
    const isAlphaNum = (code: number) => (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

    const preserveChar = (ch: string, code: number): boolean => {
      if (ch === ' ') return preserveSpaces;
      if (preserveSeparators === true) return !isAlphaNum(code);
      if (preserveSeparators === false) return false;
      if (preserveSeparators instanceof RegExp) return preserveSeparators.test(ch);
      if (Array.isArray(preserveSeparators)) return preserveSeparators.includes(ch);
      return false;
    };

    const output = new Array<string>(n);
    for (let i = 0; i < head; i++) output[i] = input[i] as string;
    for (let i = midEnd; i < n; i++) output[i] = input[i] as string;

    let maskedCount = 0;
    for (let i = midStart; i < midEnd; i++) {
      const ch = input[i] as string;
      const code = input.charCodeAt(i);
      if (preserveChar(ch, code)) output[i] = ch;
      else {
        output[i] = maskChar;
        maskedCount++;
      }
    }

    if (maskedCount < minMask) {
      let need = minMask - maskedCount;
      let l = Math.floor((midStart + midEnd - 1) / 2),
        r = l + 1;
      while (need > 0 && (l >= 0 || r < n)) {
        if (l >= 0 && output[l] !== maskChar && !preserveChar(input[l] as string, input.charCodeAt(l))) {
          output[l] = maskChar;
          need--;
        }

        if (need > 0 && r < n && output[r] !== maskChar && !preserveChar(input[r] as string, input.charCodeAt(r))) {
          output[r] = maskChar;
          need--;
        }
        l--;
        r++;
      }
    }

    return output.join('');
  }
}

export const stringUtils = new StringUtils();
