/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type RTECountMode = 'characters' | 'words';

export interface RTEFieldContextValue {
  labelId: string;
  descriptionId?: string;
  errorId?: string;
  disabled: boolean;
  readOnly: boolean;
  invalid: boolean;
}

export interface RTEFieldProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  /** Field label — associated with the editor via `aria-labelledby` (exposed through context). */
  label: ReactNode;
  /** Required marker + `aria-required` on the field. @default false */
  required?: boolean;
  /** Helper text above the frame. */
  description?: ReactNode;
  /** `string` shows the error line and sets the danger hue; `true` sets the hue without a message. */
  error?: string | boolean;
  /** Current content length (the wrapper is engine-agnostic — the product supplies this). */
  length?: number;
  /** Enforced limit; drives the counter's warn/error crossings. */
  maxLength?: number;
  /** Count characters or words. @default 'characters' */
  countMode?: RTECountMode;
  /** Document mode — no toolbar/counter/footer, selectable content, sunken fill. @default false */
  readOnly?: boolean;
  /** Sunken fill, dimmed, no focus. @default false */
  disabled?: boolean;
  /** Show the fullscreen toggle. @default false */
  fullscreenEnabled?: boolean;
  /** Controlled fullscreen state. */
  fullscreen?: boolean;
  /** Fullscreen open/close callback. */
  onFullscreenChange?: (fullscreen: boolean) => void;
  /** `RTEField.Toolbar`, `.Content`, `.Attachments`, `.Footer`. */
  children: ReactNode;
}

export type RTEFieldToolbarProps = ComponentPropsWithoutRef<'div'>;

export interface RTEFieldToolbarButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'aria-label'> {
  /** Required accessible name — a bare icon toggle without one is a defect. */
  'aria-label': string;
  /** Toggle state — sets `aria-pressed` and the accent-soft pressed fill. */
  pressed?: boolean;
}

export type RTEFieldContentProps = ComponentPropsWithoutRef<'div'>;
export type RTEFieldFooterProps = ComponentPropsWithoutRef<'div'>;

export interface RTEAttachment {
  id: string;
  label: string;
}

export interface RTEFieldAttachmentsProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  value: RTEAttachment[];
  onRemove?: (id: string) => void;
}
