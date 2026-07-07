/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type TimelineStatus = 'default' | 'completed' | 'current' | 'upcoming' | 'success' | 'warning' | 'danger';

export type TimelineProps = ComponentPropsWithoutRef<'ol'>;

export interface TimelineItemProps extends Omit<ComponentPropsWithoutRef<'li'>, 'title'> {
  /** Marker vocabulary — status is joined to the entry text via a visually-hidden prefix (never color alone). @default 'default' */
  status?: TimelineStatus;
  /** Custom marker (e.g. an xs Avatar) — overrides the status glyph. */
  marker?: ReactNode;
  /** Entry title. */
  title: ReactNode;
  /** Relative or absolute timestamp. */
  timestamp?: ReactNode;
}
