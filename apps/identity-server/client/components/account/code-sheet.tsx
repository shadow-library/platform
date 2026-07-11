/**
 * Importing npm packages
 */
import { Alert, Button, Dialog } from '@shadow-library/ui';
import { type ReactElement, useState } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

interface CodeSheetDialogProps {
  codes: string[] | null;
  onClose(): void;
}

/**
 * Declaring the constants
 */

/** One-time presentation of recovery codes: mono grid, copy affordance, explicit acknowledgement. */
export function CodeSheetDialog({ codes, onClose }: CodeSheetDialogProps): ReactElement {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    if (!codes) return;
    await navigator.clipboard.writeText(codes.join('\n')).catch(() => undefined);
    setCopied(true);
  };

  return (
    <Dialog open={codes !== null} onOpenChange={open => (open ? undefined : onClose())}>
      <Dialog.Content size="md">
        <Dialog.Header title="Save your recovery codes" description="Each code signs you in once if you lose your other factors. They are shown only now." showClose={false} />
        <Dialog.Body>
          <div className="stack gap-16">
            <Alert intent="warning" title="Store these somewhere safe — a password manager or printed copy." />
            <div className="identity-code-sheet">
              {(codes ?? []).map(code => (
                <span key={code}>{code}</span>
              ))}
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <div className="cluster gap-8">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy all'}
            </Button>
            <Button variant="primary" onClick={onClose}>
              I saved them
            </Button>
          </div>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
