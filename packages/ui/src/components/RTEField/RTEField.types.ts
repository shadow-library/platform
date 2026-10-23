import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

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
  label: ReactNode;
  /** Required marker + `aria-required` on the field. @default false */
  required?: boolean;
  description?: ReactNode;
  /** `string` shows the error line and sets the danger hue; `true` sets the hue without a message. */
  error?: string | boolean;
  /** Current content length (the wrapper is engine-agnostic — the product supplies this). */
  length?: number;
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
  onFullscreenChange?: (fullscreen: boolean) => void;
  children: ReactNode;
}

export type RTEFieldToolbarProps = ComponentPropsWithoutRef<'div'>;

export interface RTEFieldToolbarButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'aria-label'> {
  'aria-label': string;
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
