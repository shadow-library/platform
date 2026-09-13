import { type ReactNode } from 'react';
import { Button, Dialog } from '@shadow-library/ui';

import { SecretOncePanel } from '@/features/portal';

interface SecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Shown directly under the title (e.g. "key-name · expires 12 Dec 2026"); distinct from `description` below the reveal panel. */
  subtitle?: ReactNode;
  description?: ReactNode;
  secret?: string;
  codes?: string[];
  downloadName?: string;
  /** Gates the close action behind the "I've saved this" checkbox instead of an always-on Done button. */
  requireConfirm?: boolean;
}

export function SecretDialog({ open, onOpenChange, title, subtitle, description, secret, codes, downloadName, requireConfirm }: SecretDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        size="md"
        onEscapeKeyDown={requireConfirm ? event => event.preventDefault() : undefined}
        onInteractOutside={requireConfirm ? event => event.preventDefault() : undefined}
      >
        <Dialog.Header title={title} description={subtitle} showClose={false} />
        <Dialog.Body>
          <SecretOncePanel
            secret={secret}
            codes={codes}
            description={description}
            downloadName={downloadName}
            onConfirm={requireConfirm ? () => onOpenChange(false) : undefined}
            confirmLabel="Done — I’ve saved it"
          />
        </Dialog.Body>
        {!requireConfirm && (
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="primary" fullWidth>
                Done — I’ve saved it
              </Button>
            </Dialog.Close>
          </Dialog.Footer>
        )}
      </Dialog.Content>
    </Dialog>
  );
}
