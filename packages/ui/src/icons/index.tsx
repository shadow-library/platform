import { type ReactElement, type SVGProps } from 'react';

/** Internal glyph set, spreading `...props` onto the SVG. Decorative (`aria-hidden`); the host control owns the accessible name. */
type IconProps = SVGProps<SVGSVGElement>;

export function CompactCheckIcon(props: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}

export function CompactChevronDownIcon(props: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 6.5L8 10.5L12 6.5" />
    </svg>
  );
}

export function CompactChevronRightIcon(props: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6.5 4L10.5 8L6.5 12" />
    </svg>
  );
}
