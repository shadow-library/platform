/**
 * Importing npm packages
 */
import { type SVGProps } from 'react';

/**
 * Declaring the constants
 */

/**
 * Internal, shared glyph set. These are not part of the public API — components import them so a
 * single path definition backs every use (a glyph redesign is one edit, not one per component). Each
 * icon spreads `...props`, so a host control can tune presentational attributes (`strokeWidth`, size)
 * without forking the markup. Decorative by default (`aria-hidden`); the surrounding control owns the
 * accessible name.
 */
type IconProps = SVGProps<SVGSVGElement>;

/** Checkmark — selection controls and menu indicators. `strokeWidth` matches the host control's weight. */
export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true' {...props}>
      <path d='M3 8.5l3.5 3.5L13 5' />
    </svg>
  );
}

/** Downward chevron — the open affordance on selects and comboboxes. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true' {...props}>
      <path d='M4 6.5L8 10.5L12 6.5' />
    </svg>
  );
}

/** Rightward chevron — the submenu affordance on menus. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true' {...props}>
      <path d='M6.5 4L10.5 8L6.5 12' />
    </svg>
  );
}
