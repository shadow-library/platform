import { type ReactElement, type ReactNode } from 'react';
import { BottomSheet, Dialog, useMediaQuery } from '@shadow-library/ui';

export interface OverlaySurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

/**
 * One overlay for both surfaces: a thumb-reachable sheet under 640px on a coarse pointer, the dialog the
 * same content deserves on a desktop viewport. Callers describe the content, never the presentation.
 */
export function OverlaySurface({ open, onOpenChange, title, description, footer, size = 'sm', children }: OverlaySurfaceProps): ReactElement {
  const isTouchLayout = useMediaQuery('(max-width: 639px)');

  if (isTouchLayout)
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title={title} footer={footer}>
        {description ? <p className="text-secondary text-body-sm">{description}</p> : null}
        {children}
      </BottomSheet>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size={size}>
        <Dialog.Header title={title} description={description} />
        <Dialog.Body>{children}</Dialog.Body>
        {footer ? <Dialog.Footer>{footer}</Dialog.Footer> : null}
      </Dialog.Content>
    </Dialog>
  );
}
