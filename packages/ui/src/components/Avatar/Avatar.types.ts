/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'square';
export type AvatarPresence = 'online' | 'offline' | 'away' | 'busy';

export interface AvatarProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  /** Full name — drives the deterministic initials fallback and the accessible name. */
  name?: string;
  /** Image URL. Falls back to initials after load failure or a 300ms wait. */
  src?: string;
  /** Overrides the image `alt` / accessible name. Pass `''` to make the avatar decorative (name shown adjacent). */
  alt?: string;
  /** 20 / 24 / 32 (default) / 40 / 64. @default 'md' */
  size?: AvatarSize;
  /** Circle for people, radius-6 square for workspaces/orgs. @default 'circle' */
  shape?: AvatarShape;
  /** Live presence dot — announced in words, collaboration surfaces only. */
  presence?: AvatarPresence;
  /** Fallback glyph when there is no name (anonymous / pending invite). */
  icon?: ReactNode;
}

export interface AvatarGroupProps extends ComponentPropsWithoutRef<'div'> {
  /** Visible avatars before collapsing the rest into a "+N" counter. @default 5 */
  max?: number;
  /** Size applied to every avatar in the group (children may still override). @default 'md' */
  size?: AvatarSize;
}
