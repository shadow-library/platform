/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

type LogoLetter = (typeof LETTERS)[number];

interface LetterSize {
  width: number;
  height: number;
}

type LetterSizes = Record<LogoLetter, LetterSize>;

export interface LogoDimensions {
  letterSpacing: number;
  letterSizes: LetterSizes;
  height: number;
}

/**
 * Declaring the constants
 */
const LETTERS = ['S', 'H', 'A', 'D', 'O', 'W'] as const;
const LETTER_WIDTHS: Record<LogoLetter, number> = { S: 290, H: 290, A: 350, D: 300, O: 290, W: 430 };
const ORIGINAL_TOTAL_WIDTH = Object.values(LETTER_WIDTHS).reduce((sum, w) => sum + w, 0);
const ORIGINAL_HEIGHT = 410;

export function computeLogoDimensions(width: number): LogoDimensions {
  // Calculate spacing as a proportion of total width (roughly 2.5% per gap)
  const totalSpacing = width * 0.125; // 5 gaps total
  const letterSpacing = totalSpacing / (LETTERS.length - 1);
  const availableWidthForLetters = width - totalSpacing;
  const scale = availableWidthForLetters / ORIGINAL_TOTAL_WIDTH;

  const height = ORIGINAL_HEIGHT * scale;
  const letterSizes = LETTERS.reduce(
    (acc, letter) => Object.assign(acc, { [letter]: { width: LETTER_WIDTHS[letter] * scale, height: ORIGINAL_HEIGHT * scale } }),
    {} as LetterSizes,
  );

  return { letterSpacing, letterSizes, height };
}
