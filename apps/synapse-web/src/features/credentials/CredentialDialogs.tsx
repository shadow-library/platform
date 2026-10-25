import { type ReactElement, useState } from 'react';
import { Alert, Button, Dialog, FormField, Input } from '@shadow-library/ui';

import { createCredential, type CredentialResponse, isApiError, rotateCredential } from '@/lib';

import { credentialErrorMessage, type FieldErrors, hintLabel, originHost, validateCreateForm, validateSecret } from './credential-view';
import styles from './Credentials.module.css';

interface DialogActionsProps {
  pending: boolean;
  label: string;
  onSubmit: () => void;
}

function DialogActions({ pending, label, onSubmit }: DialogActionsProps): ReactElement {
  return (
    <Dialog.Footer>
      <Dialog.Close asChild>
        <Button variant="ghost" disabled={pending}>
          Cancel
        </Button>
      </Dialog.Close>
      <Button variant="primary" loading={pending} onClick={onSubmit}>
        {label}
      </Button>
    </Dialog.Footer>
  );
}

interface CreateCredentialDialogProps {
  onClose: () => void;
  onCreated: (credential: CredentialResponse) => void;
}

/** The parent mounts a dialog only while it is open, so closing drops the typed key with the component; closing is held while a request is in flight so its outcome is never lost. */
export function CreateCredentialDialog({ onClose, onCreated }: CreateCredentialDialogProps): ReactElement {
  const [name, setName] = useState('');
  const [allowedOrigin, setAllowedOrigin] = useState('');
  const [secret, setSecret] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    if (pending) return;
    const validation = validateCreateForm({ name, allowedOrigin, secret });
    setFailure(null);
    setErrors(validation.ok ? {} : validation.errors);
    if (!validation.ok) return;
    setPending(true);
    try {
      onCreated(await createCredential(validation.body));
    } catch (error) {
      if (isApiError(error) && error.code === 'CRED_NAME_TAKEN') setErrors({ name: credentialErrorMessage(error) });
      else setFailure(credentialErrorMessage(error));
      setPending(false);
    }
  };

  const edit = (field: keyof FieldErrors, set: (value: string) => void) => (value: string) => {
    set(value);
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  return (
    <Dialog open onOpenChange={next => next || pending || onClose()}>
      <Dialog.Content size="md">
        <Dialog.Header title="New credential" description="Store a provider API key. It is only ever sent to the address you give here." />
        <Dialog.Body>
          <div className={styles.form}>
            {failure ? (
              <Alert intent="danger" title="The credential was not created">
                {failure}
              </Alert>
            ) : null}
            <FormField label="Name" required error={errors.name} helper="Kept by the credential even once revoked, so it cannot be reused.">
              <Input value={name} onValueChange={edit('name', setName)} placeholder="openrouter" autoComplete="off" spellCheck={false} />
            </FormField>
            <FormField
              label="Only sent to"
              required
              error={errors.allowedOrigin}
              helper="The address the key is sent to: scheme, host and optional port, with no path. For example https://openrouter.ai"
            >
              <Input value={allowedOrigin} onValueChange={edit('allowedOrigin', setAllowedOrigin)} placeholder="https://openrouter.ai" autoComplete="off" spellCheck={false} />
            </FormField>
            <FormField label="API key" required error={errors.secret} helper="Stored sealed and never shown again; only a short hint is kept.">
              <Input
                type="password"
                value={secret}
                onValueChange={edit('secret', setSecret)}
                revealable={false}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
              />
            </FormField>
          </div>
        </Dialog.Body>
        <DialogActions pending={pending} label="Create credential" onSubmit={() => void submit()} />
      </Dialog.Content>
    </Dialog>
  );
}

interface RotateCredentialDialogProps {
  credential: CredentialResponse;
  onClose: () => void;
  onRotated: (credential: CredentialResponse) => void;
}

export function RotateCredentialDialog({ credential, onClose, onRotated }: RotateCredentialDialogProps): ReactElement {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    if (pending) return;
    const validation = validateSecret(secret);
    setFailure(null);
    setError(validation.ok ? undefined : validation.error);
    if (!validation.ok) return;
    setPending(true);
    try {
      onRotated(await rotateCredential(credential.id, validation.secret));
    } catch (cause) {
      setFailure(credentialErrorMessage(cause));
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={next => next || pending || onClose()}>
      <Dialog.Content size="md">
        <Dialog.Header
          title={`Rotate "${credential.name}"`}
          description={`Providers keep using this credential; only the key behind it changes. It is still only sent to ${originHost(credential.allowedOrigin)}.`}
        />
        <Dialog.Body>
          <div className={styles.form}>
            {failure ? (
              <Alert intent="danger" title="The key was not rotated">
                {failure}
              </Alert>
            ) : null}
            <FormField label="New API key" required error={error} helper={`Replaces the current key (${hintLabel(credential.hint)}); replicas pick it up within seconds.`}>
              <Input
                type="password"
                value={secret}
                onValueChange={value => {
                  setSecret(value);
                  setError(undefined);
                }}
                revealable={false}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
              />
            </FormField>
          </div>
        </Dialog.Body>
        <DialogActions pending={pending} label="Rotate key" onSubmit={() => void submit()} />
      </Dialog.Content>
    </Dialog>
  );
}
