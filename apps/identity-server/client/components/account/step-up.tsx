/**
 * Importing npm packages
 */
import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Dialog, FormField, OtpInput } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { api, ApiError } from '../../lib/api';

/**
 * Defining types
 */

type Elevated<T> = () => Promise<T>;

interface StepUpContextValue {
  /** Runs an action; a 403 step-up rejection opens the TOTP dialog and retries once elevated. */
  withStepUp<T>(action: Elevated<T>): Promise<T>;
}

/**
 * Declaring the constants
 */
const StepUpContext = createContext<StepUpContextValue | null>(null);

export function useStepUp(): StepUpContextValue {
  const context = useContext(StepUpContext);
  if (!context) throw new Error('useStepUp must be used within StepUpProvider');
  return context;
}

const isStepUpRequired = (cause: unknown): boolean => cause instanceof ApiError && cause.status === 403 && cause.code === 'AUTH_006';

/** Session elevation gate: sensitive actions transparently prompt for a fresh second factor. */
export function StepUpProvider({ children }: { children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const pending = useRef<{ resolve: () => void; reject: (cause: unknown) => void } | null>(null);

  const withStepUp = useCallback(async <T,>(action: Elevated<T>): Promise<T> => {
    try {
      return await action();
    } catch (cause) {
      if (!isStepUpRequired(cause)) throw cause;
      await new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setCode('');
        setError(null);
        setOpen(true);
      });
      return action();
    }
  }, []);

  const verify = async (submitted: string): Promise<void> => {
    if (submitted.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.stepUp(submitted);
      setOpen(false);
      pending.current?.resolve();
      pending.current = null;
    } catch {
      setCode('');
      setError('That code was not accepted. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = (nextOpen: boolean): void => {
    if (nextOpen) return;
    setOpen(false);
    pending.current?.reject(new ApiError(403, 'AUTH_006', 'Step-up cancelled'));
    pending.current = null;
  };

  return (
    <StepUpContext.Provider value={{ withStepUp }}>
      {children}
      <Dialog open={open} onOpenChange={cancel}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Confirm it's you" description="This action needs a fresh verification. Enter the code from your authenticator app." />
          <Dialog.Body>
            <FormField label="6-digit code" error={error}>
              <OtpInput length={6} type="numeric" value={code} onValueChange={setCode} onComplete={value => void verify(value)} autoFocus disabled={busy} />
            </FormField>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog>
    </StepUpContext.Provider>
  );
}
