/**
 * Importing npm packages
 */
import { Button, Dialog, FormField, OtpInput, toast } from '@shadow-library/ui';
import { type ReactElement, useState } from 'react';

/**
 * Importing user defined packages
 */
import { LockIcon } from '@/components/icons';
import { useMeQuery, useStepUpMutation } from '@/lib/apis';

import styles from './portal.module.css';

/**
 * Defining types
 */
interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  reason?: string;
  onElevated: () => void;
}

/**
 * Declaring the constants
 */

/**
 * The AAL2 step-up prompt. The identity server elevates a session with a second factor, so this
 * collects an authenticator code (the design's password field is re-cast as the real elevation
 * mechanism) and, on success, runs the deferred sensitive action.
 */
export function StepUpDialog({
  open,
  onOpenChange,
  title = 'Confirm it’s you',
  reason = 'This is a sensitive change. Enter a code from your authenticator app to continue.',
  onElevated,
}: StepUpDialogProps): ReactElement {
  const stepUp = useStepUpMutation();
  const [code, setCode] = useState('');

  const verify = (value: string): void => {
    if (value.length < 6) return;
    stepUp.mutate(value, {
      onSuccess: () => {
        onOpenChange(false);
        setCode('');
        onElevated();
      },
      onError: error => toast.danger(error.message),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) setCode('');
      }}
    >
      <Dialog.Content size="sm">
        <Dialog.Header title={title} description="This is a sensitive change" />
        <Dialog.Body>
          <div className={styles.stepUp}>
            <span className={styles.stepUpIcon}>
              <LockIcon size={20} />
            </span>
            <p className={styles.stepUpReason}>{reason}</p>
            <FormField label="Authenticator code">
              <OtpInput length={6} value={code} onValueChange={setCode} onComplete={verify} invalid={stepUp.isError} autoFocus />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="secondary" fullWidth>
              Cancel
            </Button>
          </Dialog.Close>
          <Button variant="primary" fullWidth loading={stepUp.isPending} onClick={() => verify(code)}>
            Confirm
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

/**
 * Gate a sensitive action behind AAL2. `require(action)` runs it immediately if the session is
 * already elevated, otherwise it opens the step-up dialog and runs the action once elevation
 * succeeds. Render the returned `dialog` somewhere in the page.
 */
export function useStepUpGate(): { require: (action: () => void) => void; dialog: ReactElement } {
  const me = useMeQuery();
  const [pending, setPending] = useState<(() => void) | null>(null);

  const require = (action: () => void): void => {
    if (me.data?.elevated) action();
    else setPending(() => action);
  };

  const dialog = (
    <StepUpDialog
      open={pending !== null}
      onOpenChange={open => {
        if (!open) setPending(null);
      }}
      onElevated={() => {
        const action = pending;
        setPending(null);
        action?.();
      }}
    />
  );

  return { require, dialog };
}
