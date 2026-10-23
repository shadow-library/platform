export interface MaskOptions {
  /** Defaults to `*` */
  maskChar?: string;

  /** Characters left unmasked at the start of the whole string. Defaults to 1. */
  keepStart?: number;

  /** Characters left unmasked at the end of the whole string. Defaults to 1. */
  keepEnd?: number;

  /** Defaults to true */
  preserveSpaces?: boolean;

  /** `true` preserves every non-alphanumeric char except space (see `preserveSpaces`); a RegExp or string[] preserves only matches. Defaults to false. */
  preserveSeparators?: boolean | RegExp | string[];

  /** Minimum number of masked chars, for very short strings. Defaults to 0. */
  minMask?: number;
}
