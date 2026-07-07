/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * The whole card is one link/button: hover raises `border-strong` + `shadow-e1`, pressed drops the
   * shadow, focus shows the standard ring, cursor is a pointer. Pair with `asChild` + a real `<a>`/`<button>`
   * so it is keyboard-operable — one interaction model per card. @default false
   */
  interactive?: boolean;
  /** Selected state for card-radio / picker patterns: accent border (color does the work). @default false */
  selected?: boolean;
  /** Render the card as its single child (e.g. an `<a>`) via Slot, so an interactive card can be a real link. @default false */
  asChild?: boolean;
  /** Padding scale shared by Header/Body/Footer via context (16 / 20 / 24). @default 'md' */
  padding?: CardPadding;
}

export interface CardHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Title (body 600). Omit and pass `children` for full control of the header row. */
  title?: ReactNode;
  /** Trailing action — an icon button, badge, or "···" menu. */
  action?: ReactNode;
}

export type CardBodyProps = ComponentPropsWithoutRef<'div'>;
export type CardFooterProps = ComponentPropsWithoutRef<'div'>;
