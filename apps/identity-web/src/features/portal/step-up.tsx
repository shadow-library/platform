/**
 * Importing npm packages
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Button, Dialog, FormField, Input, OtpInput, Spinner, toast } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { LockIcon } from '@/components/icons';
import { assertPasskey } from '@/features/auth';
import { meKeys, requestPasskeyStepUpOptions, type StepUpMethod, useMeQuery, useStepUpMethodsQuery, useStepUpMutation, verifyPasskeyStepUp } from '@/lib/apis';

import styles from './portal.module.css';

/**
 * Defining types
 */
interface StepUpFieldsProps {
  methods: StepUpMethod[] | undefined;
  loading?: boolean;
  onElevated: () => void;
}

interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  methods: StepUpMethod[] | undefined;
  methodsLoading?: boolean;
  onElevated: () => void;
}

/**
 * Declaring the constants
 */
const OTP_LENGTH = 6;
const METHOD_PRIORITY: StepUpMethod[] = ['TOTP', 'WEBAUTHN', 'PASSWORD'];
const METHOD_LABEL: Record<StepUpMethod, string> = { TOTP: 'authenticator app', WEBAUTHN: 'passkey', PASSWORD: 'password' };
const METHOD_REASON: Record<StepUpMethod, string> = {
  TOTP: 'This is a sensitive change. Enter a code from your authenticator app to continue.',
  WEBAUTHN: 'This is a sensitive change. Confirm with your passkey to continue.',
  PASSWORD: 'This is a sensitive change. Re-enter your password to continue.',
};

/**
 * The interactive step-up form. It renders only the factor the account can actually satisfy: an
 * authenticator code, a passkey assertion, or — for accounts with no second factor — a password
 * re-entry. An account with no usable method (e.g. federated with no MFA) is sent to enrol one.
 * Shared by the console step-up dialog and the consent screen so both negotiate factors identically.
 */
export function StepUpFields({ methods, loading, onElevated }: StepUpFieldsProps): ReactElement {
  const queryClient = useQueryClient();
  const stepUp = useStepUpMutation();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [override, setOverride] = useState<StepUpMethod | null>(null);

  const passkey = useMutation<unknown, Error, undefined>({
    mutationFn: async () => {
      const options = await requestPasskeyStepUpOptions();
      const ceremony = await assertPasskey(options);
      if (ceremony.outcome === 'UNSUPPORTED') throw new Error('This device doesn’t support passkeys.');
      if (ceremony.outcome === 'CANCELLED') throw new Error('CANCELLED');
      return verifyPasskeyStepUp(ceremony.response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meKeys.all });
      onElevated();
    },
    onError: error => {
      if (error.message !== 'CANCELLED') toast.danger(error.message);
    },
  });

  if (loading || methods === undefined)
    return (
      <div className={styles.stepUp}>
        <Spinner size="md" label="Checking your security options" />
      </div>
    );

  const available = methods;
  const current = (override && available.includes(override) ? override : null) ?? METHOD_PRIORITY.find(method => available.includes(method)) ?? null;
  const busy = stepUp.isPending || passkey.isPending;

  const submitCode = (value: string): void => {
    if (value.length < OTP_LENGTH) return;
    stepUp.mutate({ code: value }, { onSuccess: onElevated, onError: error => toast.danger(error.message) });
  };
  const submitPassword = (): void => {
    if (!password) return;
    stepUp.mutate({ password }, { onSuccess: onElevated, onError: error => toast.danger(error.message) });
  };

  if (current === null)
    return (
      <div className={styles.stepUp}>
        <span className={styles.stepUpIcon}>
          <LockIcon size={20} />
        </span>
        <p className={styles.stepUpReason}>This is a sensitive change. Set up a second factor to secure your account before continuing.</p>
        <Button variant="primary" fullWidth asChild>
          <Link to="/account/security">Set up a second factor</Link>
        </Button>
      </div>
    );

  const alternatives = available.filter(method => method !== current);

  return (
    <div className={styles.stepUp}>
      <span className={styles.stepUpIcon}>
        <LockIcon size={20} />
      </span>
      <p className={styles.stepUpReason}>{METHOD_REASON[current]}</p>

      {current === 'TOTP' && (
        <FormField label="Authenticator code">
          <OtpInput length={OTP_LENGTH} value={code} onValueChange={setCode} onComplete={submitCode} invalid={stepUp.isError} autoFocus />
        </FormField>
      )}

      {current === 'PASSWORD' && (
        <FormField label="Password">
          <Input type="password" revealable autoComplete="current-password" value={password} onValueChange={setPassword} invalid={stepUp.isError} autoFocus />
        </FormField>
      )}

      {current === 'WEBAUTHN' ? (
        <Button variant="primary" fullWidth loading={passkey.isPending} onClick={() => passkey.mutate(undefined)}>
          Use your passkey
        </Button>
      ) : (
        <Button variant="primary" fullWidth loading={stepUp.isPending} onClick={() => (current === 'TOTP' ? submitCode(code) : submitPassword())}>
          Confirm
        </Button>
      )}

      {alternatives.map(method => (
        <Button key={method} variant="ghost" size="sm" disabled={busy} onClick={() => setOverride(method)}>
          Use your {METHOD_LABEL[method]} instead
        </Button>
      ))}
    </div>
  );
}

/**
 * The AAL2 step-up prompt, shown when a sensitive action needs a fresh factor proof. The identity
 * server decides which factors this account may elevate with; the fields adapt to that set.
 */
export function StepUpDialog({ open, onOpenChange, title = 'Confirm it’s you', methods, methodsLoading, onElevated }: StepUpDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header title={title} description="This is a sensitive change" />
        <Dialog.Body>
          <StepUpFields
            methods={methods}
            loading={methodsLoading}
            onElevated={() => {
              onOpenChange(false);
              onElevated();
            }}
          />
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="secondary" fullWidth>
              Cancel
            </Button>
          </Dialog.Close>
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
  const methods = useStepUpMethodsQuery(pending !== null);

  const require = (action: () => void): void => {
    if (me.data?.elevated) action();
    else setPending(() => action);
  };

  const dialog = (
    <StepUpDialog
      open={pending !== null}
      methods={methods.data?.methods}
      methodsLoading={methods.isLoading}
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
