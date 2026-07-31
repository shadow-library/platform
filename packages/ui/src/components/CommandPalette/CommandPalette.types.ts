/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export interface CommandItem {
  /** Stable id. */
  id: string;
  /** Group heading (Actions / Pages / Records …); groups render in first-seen order. */
  group: string;
  /** Verb-first label matching the action's visible UI name. */
  label: string;
  /** Leading icon (rendered in a tile). */
  icon?: ReactNode;
  /** Kbd binding string for the trailing hint (e.g. `mod+shift+R`). */
  shortcut?: string;
  /** Meta line — state the consequence for side-effecting actions. */
  meta?: ReactNode;
  /** Extra match terms beyond the label. */
  keywords?: string[];
  /** Runs on select; the palette closes afterward. */
  onRun: () => void;
}

export interface CommandPaletteProps {
  /** The registered commands. */
  commands: CommandItem[];
  /** Controlled open state. */
  open?: boolean;
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean;
  /** Fires when the palette opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Global toggle binding; `null` disables the listener (use a visible trigger). @default 'mod+k' */
  hotkey?: string | null;
  /** Search field placeholder. @default 'Type a command or search…' */
  placeholder?: string;
  /** Row shown when nothing matches. @default 'No results' */
  emptyMessage?: string;
}
