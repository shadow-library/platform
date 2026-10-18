import { type ReactNode } from 'react';

import { type ConfirmDialogProps } from '@/components/Dialog';

export type ConfirmOptions = Pick<ConfirmDialogProps, 'title' | 'description' | 'intent' | 'confirmLabel' | 'cancelLabel' | 'typedConfirmation'>;

/** Resolves `true` on confirm and `false` on cancel, on Escape, or when a newer request or an unmount supersedes it. */
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export interface ConfirmProviderProps {
  children?: ReactNode;
}
