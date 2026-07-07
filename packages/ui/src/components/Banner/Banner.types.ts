/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type BannerIntent = 'info' | 'success' | 'warning' | 'danger';

/** The single action — a link or a callback. A second action means it's a Dialog's job. */
export interface BannerAction {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Swaps the underline for a spinner during an immediate operation ("Retry connection"). */
  loading?: boolean;
}

export interface BannerProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'onClick'> {
  /** Intent vocabulary shared with Alert. @default 'info' */
  intent?: BannerIntent;
  /** The one-sentence message. */
  message: ReactNode;
  /** Optional 600-weight lead ("Payment failed"). */
  lead?: ReactNode;
  /** The single action. */
  action?: BannerAction;
  /** Show a dismiss button. System-state banners omit it and leave when the state does. @default false */
  dismissable?: boolean;
  /** Fires when the dismiss button is pressed. */
  onDismiss?: () => void;
}

/** Declarative registration passed to `useBanner`; the provider enforces the one-visible queue. */
export interface BannerConfig {
  /** Stable identity — dismissal state and the queue key hang off this. */
  id: string;
  intent?: BannerIntent;
  message: ReactNode;
  lead?: ReactNode;
  action?: BannerAction;
  dismissable?: boolean;
  /** Ties the banner's lifetime to its condition — `false` withdraws it from the queue. @default true */
  when?: boolean;
}
