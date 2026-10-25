import { type ReactElement, useState } from 'react';
import { Alert, Button, Dialog, FormField, Input, Select } from '@shadow-library/ui';

import { createCredential, type CredentialResponse, isApiError, rotateCredential } from '@/lib';

import {
  credentialErrorMessage,
  type Destination,
  destinationName,
  type FieldErrors,
  hintLabel,
  originHost,
  suggestedName,
  validateCreateForm,
  validateSecret,
} from './credential-view';
import styles from './Credentials.module.css';
import { type KeyDestinationList, useKeyDestinations } from './use-key-destinations';

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
  takenNames: readonly string[];
  onClose: () => void;
  onCreated: (credential: CredentialResponse) => void;
}

const OTHER_ADDRESS = 'other';

function destinationOf(destinations: KeyDestinationList, choice: string, address: string): Destination {
  if (destinations.status !== 'ready' || destinations.items.length === 0 || choice === OTHER_ADDRESS) return { kind: 'address', input: address };
  return { kind: 'provider', origin: destinations.items.some(destination => destination.origin === choice) ? choice : null };
}

function providerHelper(destination: Destination): string {
  if (destination.kind === 'provider' && destination.origin !== null) return `Synapse only ever sends this key to ${originHost(destination.origin)}, the provider's address.`;
  return "Synapse only ever sends the key to the chosen provider's address.";
}

interface ProviderFieldProps {
  destinations: KeyDestinationList;
  choice: string;
  destination: Destination;
  error?: string;
  onChoose: (choice: string) => void;
}

function ProviderField({ destinations, choice, destination, error, onChoose }: ProviderFieldProps): ReactElement | null {
  if (destinations.status === 'unavailable' || (destinations.status === 'ready' && destinations.items.length === 0)) return null;
  const items = destinations.status === 'ready' ? destinations.items : [];
  return (
    <FormField label="Provider" required error={destination.kind === 'provider' ? error : undefined} helper={providerHelper(destination)}>
      <Select
        value={choice || undefined}
        onValueChange={onChoose}
        placeholder={destinations.status === 'loading' ? 'Loading providers…' : 'Choose the provider this key is for'}
        loading={destinations.status === 'loading'}
        disabled={destinations.status === 'loading'}
        aria-label="Provider"
      >
        {items.map(item => (
          <Select.Item key={item.origin} value={item.origin} description={originHost(item.origin)}>
            {destinationName(item)}
          </Select.Item>
        ))}
        <Select.Separator />
        <Select.Item value={OTHER_ADDRESS} description="A provider that is not in the catalog yet">
          Another address
        </Select.Item>
      </Select>
    </FormField>
  );
}

/** The parent mounts a dialog only while it is open, so closing drops the typed key with the component; closing is held while a request is in flight so its outcome is never lost. */
export function CreateCredentialDialog({ takenNames, onClose, onCreated }: CreateCredentialDialogProps): ReactElement {
  const destinations = useKeyDestinations();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [choice, setChoice] = useState('');
  const [address, setAddress] = useState('');
  const [secret, setSecret] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const destination = destinationOf(destinations, choice, address);

  const submit = async (): Promise<void> => {
    if (pending) return;
    const validation = validateCreateForm({ name, destination, secret });
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

  const choose = (next: string): void => {
    edit('allowedOrigin', setChoice)(next);
    if (nameTouched) return;
    const chosen = destinations.status === 'ready' ? destinations.items.find(item => item.origin === next) : undefined;
    edit('name', setName)((chosen && suggestedName(chosen, new Set(takenNames))) ?? '');
  };

  return (
    <Dialog open onOpenChange={next => next || pending || onClose()}>
      <Dialog.Content size="md">
        <Dialog.Header title="New credential" description="Store the API key of one of your AI providers. Synapse only ever sends it to that provider's address." />
        <Dialog.Body>
          <div className={styles.form}>
            {failure ? (
              <Alert intent="danger" title="The credential was not created">
                {failure}
              </Alert>
            ) : null}
            <ProviderField destinations={destinations} choice={choice} destination={destination} error={errors.allowedOrigin} onChoose={choose} />
            {destination.kind === 'address' ? (
              <FormField
                label="Provider address"
                required
                error={errors.allowedOrigin}
                helper="Where the key is sent: scheme, host and optional port, with no path. For example https://openrouter.ai"
              >
                <Input value={address} onValueChange={edit('allowedOrigin', setAddress)} placeholder="https://openrouter.ai" autoComplete="off" spellCheck={false} />
              </FormField>
            ) : null}
            <FormField label="Name" required error={errors.name} helper="How providers and teammates refer to this key. Kept even once revoked, so it cannot be reused.">
              <Input
                value={name}
                onValueChange={value => {
                  setNameTouched(true);
                  edit('name', setName)(value);
                }}
                placeholder="openrouter"
                autoComplete="off"
                spellCheck={false}
              />
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
