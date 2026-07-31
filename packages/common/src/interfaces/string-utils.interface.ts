/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

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
