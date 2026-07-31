/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type DrawerPlacement = 'right' | 'left' | 'bottom';
export type DrawerSize = 'sm' | 'md' | 'lg';

export interface DrawerProps {
  /** Controlled open state. */
  open: boolean;
  /** Fires when the drawer should open or close. */
  onOpenChange?: (open: boolean) => void;
  /** Edge the panel slides from. @default 'right' */
  placement?: DrawerPlacement;
  /** Panel width (side placements). @default 'md' */
  size?: DrawerSize;
  /** Modal traps focus + scrim + scroll-lock (focused edits); non-modal keeps the page interactive (browse-and-inspect). @default true */
  modal?: boolean;
  /** Accessible name when no `Drawer.Header` title is present. */
  'aria-label'?: string;
  className?: string;
  children?: ReactNode;
}

export interface DrawerHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Record title (heading-3). */
  title: ReactNode;
  /** One line of identifying meta. */
  meta?: ReactNode;
  /** Render the close ×. @default true */
  showClose?: boolean;
}

export type DrawerBodyProps = ComponentPropsWithoutRef<'div'>;

export interface DrawerFooterProps extends ComponentPropsWithoutRef<'div'> {
  /** Ghost cancel label — closes the drawer. */
  cancel?: ReactNode;
  /** Primary action label. */
  action?: ReactNode;
  onAction?: () => void;
  loading?: boolean;
}
