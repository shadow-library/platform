/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export type BadgeIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type BadgeVariant = 'soft' | 'outline' | 'count' | 'dot';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  /** Closed semantic set. @default 'neutral' */
  intent?: BadgeIntent;
  /**
   * `soft` (tinted pill, default) · `outline` (bordered, neutral) · `count` (solid number pill) ·
   * `dot` (bare intent dot + adjacent text, for dense tables). @default 'soft'
   */
  variant?: BadgeVariant;
  /** Leading 6px intent dot on a `soft` badge. Implied by `variant='dot'`. @default false */
  dot?: boolean;
  /** `count` only — caps the number, rendering `{max}+` past it. */
  max?: number;
  /** 20px default · 16px dense (no dot). @default 'md' */
  size?: BadgeSize;
}
