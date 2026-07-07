/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export type SplitDirection = 'horizontal' | 'vertical';

/** A size in px (number) or a percentage of the container (`'25%'`). */
export type SplitSize = number | `${number}%`;

export interface SplitPanePaneProps {
  /** Starting size of this pane along the split axis. Only the first pane's size is authoritative. */
  defaultSize?: SplitSize;
  /** Smallest honest size — the width/height at which the content still works, not 0. */
  minSize?: SplitSize;
  /** Largest size. */
  maxSize?: SplitSize;
  /** Allow drag-past-min collapse, leaving a labeled restore rail. Auxiliary panes only. */
  collapsible?: boolean;
  /** Label for the collapsed pane's restore control. @default 'panel' */
  collapseLabel?: string;
  /** Pane content — opaque to the container. */
  children?: ReactNode;
  className?: string;
}

export interface SplitPaneHandleProps {
  /** Names what the handle resizes ("Resize explorer") for the window-splitter pattern. */
  'aria-label'?: string;
}

export interface SplitPaneProps {
  /** Split axis: `horizontal` lays panes in columns, `vertical` in rows. @default 'horizontal' */
  direction?: SplitDirection;
  /** Persistence key — the boundary position is saved per surface (localStorage). */
  autoSaveId?: string;
  /** Fires on resize commit with the first pane's size as a percentage. */
  onResize?: (percent: number) => void;
  /** Exactly `Pane, Handle, Pane`. */
  children: ReactNode;
  className?: string;
}
