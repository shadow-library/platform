/**
 * Importing npm packages
 */
import { useMemo } from 'react';
import { clsx } from 'clsx';

/**
 *  Importing user defined modules
 */
import type { Theme } from '@/types';

/**
 * Declaring types
 */

type LogoLetter = (typeof LETTERS)[number];

interface LetterSize {
  width: number;
  height: number;
}

type LetterSizes = Record<LogoLetter, LetterSize>;

interface LogoColors {
  stroke: string;
  fill: string;
}

export interface LogoProps {
  width?: number;
  theme?: Theme;
}

/**
 * Declaring constants
 */

const LETTERS = ['S', 'H', 'A', 'D', 'O', 'W'] as const;
const LETTER_WIDTHS: Record<LogoLetter, number> = { S: 290, H: 290, A: 350, D: 300, O: 290, W: 430 };
const ORIGINAL_TOTAL_WIDTH = Object.values(LETTER_WIDTHS).reduce((sum, w) => sum + w, 0);
const ORIGINAL_HEIGHT = 410;

const strokeClassName = 'fill-none stroke-[50px]';
const primaryColors: Record<Theme, LogoColors> = {
  light: { stroke: 'stroke-violet-900', fill: 'fill-violet-900' },
  dark: { stroke: 'stroke-violet-500', fill: 'fill-violet-500' },
};
const secondaryColors: Record<Theme, LogoColors> = {
  light: { stroke: 'stroke-neutral-700', fill: 'fill-neutral-700' },
  dark: { stroke: 'stroke-neutral-500', fill: 'fill-neutral-500' },
};

export default function Logo(props: LogoProps) {
  const { width = 300, theme = 'light' } = props;
  const primaryColor = primaryColors[theme];
  const secondaryColor = secondaryColors[theme];

  const { letterSpacing, letterSizes, height } = useMemo(() => {
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
  }, [width]);

  return (
    <div className="flex items-center" style={{ gap: `${letterSpacing}px`, height: `${height}px` }} role="img" aria-label="Shadow Applications logo">
      {/* S */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={letterSizes.S.width}
        height={letterSizes.S.height}
        viewBox="0 0 290 410"
        className={clsx(strokeClassName, primaryColor.stroke)}
      >
        <path d="M 25 345 L 70 385 210 385 255 340 255 265 235 245 45 165 25 145 25 70 70 25 210 25 255 70" strokeLinecap="round" />
        <path d="M 25 345 L 25 285 M 255 115 L 255 70" />
      </svg>

      {/* H */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={letterSizes.H.width}
        height={letterSizes.H.height}
        viewBox="0 0 290 410"
        className={clsx(strokeClassName, secondaryColor.stroke)}
      >
        <path d="M 25 410 L 25 0" />
        <path d="M 25 205 L 265 205" />
        <path d="M 265 410 L 265 0" />
      </svg>

      {/* A */}
      <svg xmlns="http://www.w3.org/2000/svg" width={letterSizes.A.width} height={letterSizes.A.height} viewBox="0 0 350 410" className={primaryColor.fill}>
        <path d="M 0 410 L 150 0 200 0 350 410 100 410 118.2 360 283 360 175 50 50 410 0 410" />
      </svg>

      {/* D */}
      <svg xmlns="http://www.w3.org/2000/svg" width={letterSizes.D.width} height={letterSizes.D.height} viewBox="0 0 300 410" className={secondaryColor.fill}>
        <path d="M 0 280 L 50 255 50 360 230 360 250 340 250 155 300 130 300 365 255 410 0 410 0 280" />
        <path d="M 0 230 L 50 205 50 50 230 50 250 70 250 105 300 80 300 45 255 0 0 0 0 230" />
      </svg>

      {/* O */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={letterSizes.O.width}
        height={letterSizes.O.height}
        viewBox="0 0 290 410"
        className={clsx(strokeClassName, primaryColor.stroke)}
      >
        <path d="M 25 70 L 25 345 70 385 210 385 255 340 255 70 210 25 70 25 25 70" strokeLinecap="round" />
      </svg>

      {/* W */}
      <svg xmlns="http://www.w3.org/2000/svg" width={letterSizes.W.width} height={letterSizes.W.height} viewBox="0 0 430 410" className={secondaryColor.fill}>
        <path d="M 0 0 L 86 410 136 410 215 148 294 410 344 410 430 0 380 0 314.5 312 244 80 186 80 115.5 312.5 50 0 0 0" />
      </svg>
    </div>
  );
}
