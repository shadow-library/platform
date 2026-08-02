/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export interface AccountMenuItem {
  /** Stable identity for the row — also the React key. */
  id: string;
  label: ReactNode;
  /** Leading 16px icon — use icons on all rows or none. */
  icon?: ReactNode;
  /** Danger styling; the menu always places sign-out last, below its own separator. */
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface AccountMenuSignedOut {
  /** Call to action shown in place of the avatar. @default 'Sign in' */
  label?: string;
  /** Where signing in starts — a real href, since sign-in leaves the SPA. */
  href: string;
}

export interface AccountMenuProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onSelect'> {
  /**
   * The signed-in person's display name. Its absence is not "signed out" — a profile request that
   * failed must not read as a logged-out session, so `signedOut` is what switches the surface.
   */
  name?: string;
  /** Secondary line in the menu header; the email is the one identifier people recognise. */
  email?: string;
  /** Avatar image; falls back to initials from `name`. */
  src?: string;
  /** App-specific rows, rendered above the sign-out separator in the given order. */
  items?: AccountMenuItem[];
  /** Omit to drop the sign-out row — an app with no client-side sign-out shouldn't render a dead one. */
  onSignOut?: () => void;
  /** @default 'Sign out' */
  signOutLabel?: string;
  /** Present when there is no session: renders the sign-in call to action instead of the menu. */
  signedOut?: AccountMenuSignedOut;
}
