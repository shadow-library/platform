import { type ReactNode } from 'react';

export interface CommandItem {
  id: string;
  /** Group heading (Actions / Pages / Records …); groups render in first-seen order. */
  group: string;
  label: string;
  icon?: ReactNode;
  /** Kbd binding string for the trailing hint (e.g. `mod+shift+R`). */
  shortcut?: string;
  meta?: ReactNode;
  keywords?: string[];
  /** Runs on select; the palette closes afterward. */
  onRun: () => void;
}

export interface CommandPaletteProps {
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
