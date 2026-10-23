import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type BannerIntent = 'info' | 'success' | 'warning' | 'danger';

/** The single action — a link or a callback. A second action means it's a Dialog's job. */
export interface BannerAction {
  label: string;
  href?: string;
  onClick?: () => void;
  loading?: boolean;
}

export interface BannerProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'onClick'> {
  /** Intent vocabulary shared with Alert. @default 'info' */
  intent?: BannerIntent;
  message: ReactNode;
  lead?: ReactNode;
  action?: BannerAction;
  /** Show a dismiss button. System-state banners omit it and leave when the state does. @default false */
  dismissable?: boolean;
  /** Fires when the dismiss button is pressed. */
  onDismiss?: () => void;
}

export interface BannerConfig {
  id: string;
  intent?: BannerIntent;
  message: ReactNode;
  lead?: ReactNode;
  action?: BannerAction;
  dismissable?: boolean;
  /** Ties the banner's lifetime to its condition — `false` withdraws it from the queue. @default true */
  when?: boolean;
}
