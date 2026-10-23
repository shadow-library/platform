import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type TimelineStatus = 'default' | 'completed' | 'current' | 'upcoming' | 'success' | 'warning' | 'danger';

export type TimelineProps = ComponentPropsWithoutRef<'ol'>;

export interface TimelineItemProps extends Omit<ComponentPropsWithoutRef<'li'>, 'title'> {
  /** Marker vocabulary — status is joined to the entry text via a visually-hidden prefix (never color alone). @default 'default' */
  status?: TimelineStatus;
  marker?: ReactNode;
  title: ReactNode;
  timestamp?: ReactNode;
}
