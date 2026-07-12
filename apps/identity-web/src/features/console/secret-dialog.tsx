/**
 * Importing npm packages
 */
import { Button, Dialog } from '@shadow-library/ui';
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { SecretOncePanel } from '@/features/portal';

/**
 * Defining types
 */
interface SecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  secret?: string;
  codes?: string[];
  downloadName?: string;
}

/** A modal wrapper around `SecretOncePanel` for the console's one-time secrets (client / webhook secrets). */
export function SecretDialog({ open, onOpenChange, title, description, secret, codes, downloadName }: SecretDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title={title} showClose={false} />
        <Dialog.Body>
          <SecretOncePanel secret={secret} codes={codes} description={description} downloadName={downloadName} />
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="primary" fullWidth>
              Done — I’ve saved it
            </Button>
          </Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
