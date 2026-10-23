import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /** The whole card is one link or button; pair with `asChild` and a real `<a>`/`<button>` so it is keyboard-operable. @default false */
  interactive?: boolean;
  /** Selected state for card-radio / picker patterns: accent border (color does the work). @default false */
  selected?: boolean;
  /** Render the card as its single child (e.g. an `<a>`) via Slot, so an interactive card can be a real link. @default false */
  asChild?: boolean;
  /** Padding scale shared by Header/Body/Footer via context (16 / 20 / 24). @default 'md' */
  padding?: CardPadding;
}

export interface CardHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
}

export type CardBodyProps = ComponentPropsWithoutRef<'div'>;
export type CardFooterProps = ComponentPropsWithoutRef<'div'>;
