/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
export type TooltipAlign = 'start' | 'center' | 'end';

export interface TooltipProps {
  /** The label or definition. When `null`/`undefined` the trigger renders with no tooltip. */
  content?: ReactNode;
  /** Optional keyboard shortcut shown in mono after the label (e.g. `⌘D`). */
  shortcut?: string;
  /** Preferred side; flips to stay in view. @default 'top' */
  side?: TooltipSide;
  /** Alignment along the side. @default 'center' */
  align?: TooltipAlign;
  /** Distance from the trigger in px. @default 8 */
  sideOffset?: number;
  /** Controlled open state. */
  open?: boolean;
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean;
  /** Fires when the open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Hover intent delay in ms. @default 400 */
  delayDuration?: number;
  /** The trigger — a single focusable element (Tooltip wires it as the Radix trigger via `asChild`). */
  children: ReactNode;
}

export interface TooltipProviderProps {
  /** Shared hover intent delay for the group. @default 400 */
  delayDuration?: number;
  /** Window after one tooltip closes during which siblings open with no delay. @default 300 */
  skipDelayDuration?: number;
  children: ReactNode;
}
