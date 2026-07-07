/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export interface HoverCardProps<T = unknown> {
  /** The trigger — an entity reference (mention, link, avatar). Rendered via Slot. */
  children: ReactNode;
  /** Static preview content. Use this or the async `content`/`render` pair, not both. */
  card?: ReactNode;
  /** Async loader — fires once at hover-intent so the card can open full. */
  content?: () => Promise<T>;
  /** Renders the resolved data from `content`. */
  render?: (data: T) => ReactNode;
  /** Skeleton shown at final size while `content` resolves — content pops in without reflow. */
  fallback?: ReactNode;
  /** Quiet line shown if `content` rejects. @default "Couldn't load preview" */
  errorFallback?: ReactNode;
  /** Rest delay before opening (keyboard focus uses 300ms). @default 500 */
  openDelay?: number;
  /** Grace delay before closing after the pointer leaves trigger and card. @default 300 */
  closeDelay?: number;
  /** Card width in px (user 300, record 320, repo 360). @default 300 */
  width?: number;
  /** Preferred side. @default 'bottom' */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment along the side. @default 'start' */
  align?: 'start' | 'center' | 'end';
  /** Gap from the trigger. @default 6 */
  sideOffset?: number;
  /** Accessible name for the preview dialog. @default 'Preview' */
  'aria-label'?: string;
}
