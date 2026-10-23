import { type ReactNode } from 'react';

/** Resting heights: `content` (intrinsic, capped at 60% of the viewport), `half` (50%), `full` (the viewport minus safe-area top). */
export type BottomSheetSnap = 'content' | 'half' | 'full';

export interface BottomSheetProps {
  /** Controlled open state. */
  open: boolean;
  /** Open/close callback (also fires on drag-dismiss, Esc, and scrim tap). */
  onOpenChange: (open: boolean) => void;
  /** The snap-point set the sheet can settle to. @default ['content'] */
  snapPoints?: BottomSheetSnap[];
  /** Initial snap. @default the first of `snapPoints` */
  defaultSnap?: BottomSheetSnap;
  /** Scrim + focus trap + inert background. @default true */
  modal?: boolean;
  /** Whether drag-down, Esc, and scrim tap dismiss the sheet. @default true */
  dismissable?: boolean;
  /** Header title — labels the dialog. */
  title?: ReactNode;
  /** Optional trailing header action (e.g. Reset). */
  headerAction?: ReactNode;
  /** Pinned footer actions — safe-area padded, never scroll away. */
  footer?: ReactNode;
  /** Accessible name when there is no visible `title`. */
  'aria-label'?: string;
  /** Sheet body — the scroll region. */
  children: ReactNode;
  className?: string;
}
