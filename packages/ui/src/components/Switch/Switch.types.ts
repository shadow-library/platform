/**
 * Importing npm packages
 */
import type * as SwitchPrimitive from '@radix-ui/react-switch';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface SwitchProps extends Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'asChild'> {
  /** Feature name (never the state). Renders the settings-row: label left, switch right. */
  label?: ReactNode;
  /** Secondary line beneath the label, linked via `aria-describedby`. */
  description?: ReactNode;
  /** Async in-flight treatment: the thumb moves optimistically while the track dims. */
  pending?: boolean;
}
