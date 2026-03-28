/**
 * Importing npm packages
 */
import { type ReactElement } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type Alphabet = ((props: React.SVGProps<SVGSVGElement>) => ReactElement<SVGSVGElement>) & { char: string };

/**
 * Declaring the constants
 */

export const A = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='2 -70 58 70'>
      <title>A</title>
      <path d='M2 0L27-70L35-70L60 0L52 0L46-19L16-19L10 0L2 0ZM19-26L43-26L31-61L31-61L19-26Z' />
    </svg>
  ),
  { char: 'A' },
) as Alphabet;

export const B = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 51.6 70'>
      <title>B</title>
      <path d='M8 0L8-70L47-70L57-61L57-41L52-37L60-29L60-10L50 0L8 0ZM15-38L44-38L49-43L49-59L44-63L15-63L15-38ZM15-7L46-7L52-12L52-26L46-32L15-32L15-7Z' />
    </svg>
  ),
  { char: 'B' },
) as Alphabet;

export const C = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='7 -70 51.6 70'>
      <title>C</title>
      <path d='M18 0L7-11L7-59L18-70L48-70L59-59L59-53L51-53L51-57L45-63L21-63L15-57L15-14L21-7L45-7L51-13L51-17L59-17L59-11L48 0L18 0Z' />
    </svg>
  ),
  { char: 'C' },
) as Alphabet;

export const D = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 51.400000000000006 70'>
      <title>D</title>
      <path d='M8 0L8-70L48-70L59-59L59-11L48 0L8 0ZM16-7L45-7L52-14L52-57L45-63L16-63L16-7Z' />
    </svg>
  ),
  { char: 'D' },
) as Alphabet;

export const E = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 45.2 70'>
      <title>E</title>
      <path d='M8 0L8-70L53-70L53-63L16-63L16-39L50-39L50-32L16-32L16-7L53-7L53 0L8 0Z' />
    </svg>
  ),
  { char: 'E' },
) as Alphabet;

export const F = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 44.2 70'>
      <title>F</title>
      <path d='M8 0L8-70L52-70L52-63L16-63L16-38L47-38L47-31L16-31L16 0L8 0Z' />
    </svg>
  ),
  { char: 'F' },
) as Alphabet;

export const G = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='7 -70 52.2 70'>
      <title>G</title>
      <path d='M18 0L7-11L7-59L18-70L49-70L59-59L59-53L52-53L52-57L45-63L21-63L15-57L15-14L21-7L45-7L52-14L52-30L36-30L36-37L59-37L59-11L48 0L18 0Z' />
    </svg>
  ),
  { char: 'G' },
) as Alphabet;

export const H = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 51.400000000000006 70'>
      <title>H</title>
      <path d='M8 0L8-70L16-70L16-38L52-38L52-70L59-70L59 0L52 0L52-32L16-32L16 0L8 0Z' />
    </svg>
  ),
  { char: 'H' },
) as Alphabet;

export const I = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8.5 -70 7.600000000000001 70'>
      <title>I</title>
      <path d='M9 0L9-70L16-70L16 0L9 0Z' />
    </svg>
  ),
  { char: 'I' },
) as Alphabet;

export const J = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='3.5 -70 44.6 70'>
      <title>J</title>
      <path d='M15 0L4-11L4-21L11-21L11-14L18-7L35-7L41-12L41-70L48-70L48-10L38 0L15 0Z' />
    </svg>
  ),
  { char: 'J' },
) as Alphabet;

export const K = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 51.7 70'>
      <title>K</title>
      <path d='M8 0L8-70L16-70L16-38L32-38L50-70L58-70L38-35L60 0L51 0L32-32L16-32L16 0L8 0Z' />
    </svg>
  ),
  { char: 'K' },
) as Alphabet;

export const L = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 43.2 70'>
      <title>L</title>
      <path d='M8 0L8-70L16-70L16-7L51-7L51 0L8 0Z' />
    </svg>
  ),
  { char: 'L' },
) as Alphabet;

export const M = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 61.7 70'>
      <title>M</title>
      <path d='M8 0L8-70L16-70L39-16L39-16L61-70L70-70L70 0L63 0L63-55L62-55L42-7L36-7L15-55L15-55L15 0L8 0Z' />
    </svg>
  ),
  { char: 'M' },
) as Alphabet;

export const N = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 51.300000000000004 70'>
      <title>N</title>
      <path d='M8 0L8-70L15-70L52-12L52-12L52-70L59-70L59 0L52 0L15-58L15-58L15 0L8 0Z' />
    </svg>
  ),
  { char: 'N' },
) as Alphabet;

export const O = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='7 -70 53.6 70'>
      <title>O</title>
      <path d='M18 0L7-11L7-59L18-70L50-70L61-59L61-11L50 0L18 0ZM21-7L46-7L53-14L53-57L46-63L21-63L15-57L15-14L21-7Z' />
    </svg>
  ),
  { char: 'O' },
) as Alphabet;

export const P = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 49.2 70'>
      <title>P</title>
      <path d='M8 0L8-70L48-70L57-61L57-38L48-29L16-29L16 0L8 0ZM16-36L45-36L50-41L50-59L45-63L16-63L16-36Z' />
    </svg>
  ),
  { char: 'P' },
) as Alphabet;

export const Q = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='7 -70 56 80.8'>
      <title>Q</title>
      <path d='M53-4L63 6L58 11L48 0L18 0L7-11L7-59L18-70L50-70L61-59L61-11L53-4ZM46-7L53-14L53-57L46-63L21-63L15-57L15-14L21-7L46-7Z' />
    </svg>
  ),
  { char: 'Q' },
) as Alphabet;

export const R = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 49.6 70'>
      <title>R</title>
      <path d='M49-31L58-21L58 0L50 0L50-19L40-29L16-29L16 0L8 0L8-70L48-70L57-61L57-39L49-31ZM16-63L16-36L45-36L50-41L50-59L45-63L16-63Z' />
    </svg>
  ),
  { char: 'R' },
) as Alphabet;

export const S = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='6.5 -70 48.800000000000004 70'>
      <title>S</title>
      <path d='M16 0L7-9L7-16L14-16L14-12L19-7L43-7L48-12L48-28L43-33L16-33L7-42L7-61L16-70L45-70L55-61L55-54L47-54L47-58L42-63L19-63L14-58L14-44L19-39L46-39L55-30L55-9L46 0L16 0Z' />
    </svg>
  ),
  { char: 'S' },
) as Alphabet;

export const T = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='3 -70 50 70'>
      <title>T</title>
      <path d='M24 0L24-63L3-63L3-70L53-70L53-63L32-63L32 0L24 0Z' />
    </svg>
  ),
  { char: 'T' },
) as Alphabet;

export const U = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='8 -70 51.6 70'>
      <title>U</title>
      <path d='M19 0L8-11L8-70L16-70L16-14L22-7L45-7L52-14L52-70L60-70L60-11L49 0L19 0Z' />
    </svg>
  ),
  { char: 'U' },
) as Alphabet;

export const V = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='2.5 -70 57.6 70'>
      <title>V</title>
      <path d='M27 0L3-70L10-70L31-9L31-9L52-70L60-70L35 0L27 0Z' />
    </svg>
  ),
  { char: 'V' },
) as Alphabet;

export const W = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='4 -70 78.30000000000001 70'>
      <title>W</title>
      <path d='M18 0L4-70L12-70L23-11L23-11L40-70L47-70L64-11L64-11L75-70L82-70L68 0L60 0L44-59L44-59L26 0L18 0Z' />
    </svg>
  ),
  { char: 'W' },
) as Alphabet;

export const X = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='2 -70 56.400000000000006 70'>
      <title>X</title>
      <path d='M2 0L26-36L3-70L12-70L30-42L49-70L57-70L35-36L58 0L50 0L30-30L11 0L2 0Z' />
    </svg>
  ),
  { char: 'X' },
) as Alphabet;

export const Y = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='1.5 -70 56.2 70'>
      <title>Y</title>
      <path d='M26 0L26-29L2-70L10-70L30-36L30-36L50-70L58-70L33-29L33 0L26 0Z' />
    </svg>
  ),
  { char: 'Y' },
) as Alphabet;

export const Z = Object.assign(
  (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox='5 -70 46.800000000000004 70'>
      <title>Z</title>
      <path d='M5 0L5-8L44-63L44-64L6-64L6-70L52-70L52-63L13-7L13-7L52-7L52 0L5 0Z' />
    </svg>
  ),
  { char: 'Z' },
) as Alphabet;
