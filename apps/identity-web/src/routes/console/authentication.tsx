import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, ConfirmDialog, Dialog, FormField, Input, Switch, toast } from '@shadow-library/ui';

import { PageHeader, QueryState, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import {
  type AuthModeItem,
  authModesQueryOptions,
  type SocialProviderKind,
  useAuthModesQuery,
  useCreateGlobalIdentityProviderMutation,
  useDeleteGlobalIdentityProviderMutation,
  useSetAuthModeMutation,
  useUpdateGlobalIdentityProviderMutation,
} from '@/lib/apis';

import styles from './console.module.css';

type RequireGate = (action: () => void) => void;

interface ProviderForm {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  allowSignUp: boolean;
}

/** Defaults that turn a provider's registration into two fields instead of five. Microsoft has no default issuer — the tenant id is deployment-specific. */
const PROVIDER_DEFAULTS: Record<SocialProviderKind, { issuer: string; issuerHelper: string }> = {
  GOOGLE: {
    issuer: 'https://accounts.google.com',
    issuerHelper: 'Google’s issuer never changes; the client id and secret come from an OAuth 2.0 Web application credential in the Google Cloud console.',
  },
  MICROSOFT: {
    issuer: '',
    issuerHelper: 'Must be a single Entra tenant — https://login.microsoftonline.com/<tenant-id>/v2.0. The multi-tenant “common” issuer cannot be verified and is rejected.',
  },
  APPLE: {
    issuer: 'https://appleid.apple.com',
    issuerHelper: 'Apple’s issuer never changes; the client id is the Services ID configured for Sign in with Apple.',
  },
};

export const Route = createFileRoute('/console/authentication')({
  loader: ({ context }) => context.queryClient.ensureQueryData(authModesQueryOptions()),
  component: AuthenticationPage,
});

function AuthenticationPage(): React.JSX.Element {
  const modes = useAuthModesQuery();
  const del = useDeleteGlobalIdentityProviderMutation();
  const { require, dialog } = useStepUpGate();
  const [configuring, setConfiguring] = useState<AuthModeItem | null>(null);
  const [removing, setRemoving] = useState<AuthModeItem | null>(null);

  const list = modes.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader title="Authentication" subtitle="Which sign-in methods members may use, and the upstream settings the social ones need." />

      <QueryState isLoading={modes.isLoading} error={modes.error} isEmpty={list.length === 0} emptyTitle="No sign-in methods">
        <div className={styles.rowList}>
          {list.map(mode => (
            <AuthModeRow key={mode.method} mode={mode} require={require} onConfigure={() => setConfiguring(mode)} onRemove={() => setRemoving(mode)} />
          ))}
        </div>
      </QueryState>

      <ProviderDialog mode={configuring} onOpenChange={open => !open && setConfiguring(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        intent="danger"
        title={removing ? `Remove ${removing.label} settings?` : 'Remove settings?'}
        description="The method turns off and its stored client secret is deleted. Members who signed in this way keep their accounts and can link the provider again once it is reconfigured."
        confirmLabel="Remove settings"
        loading={del.isPending}
        onConfirm={() =>
          removing?.provider &&
          del.mutate(removing.provider.id, {
            onSuccess: () => {
              toast.success(`${removing.label} settings removed`);
              setRemoving(null);
            },
            onError: error => toast.danger(error.message),
          })
        }
      />
      {dialog}
    </div>
  );
}

/**
 * Flipping an unconfigured social method on opens its settings dialog instead of firing the mutation —
 * the server refuses that switch outright, so asking for the credentials is the only way through.
 */
function AuthModeRow({ mode, require, onConfigure, onRemove }: { mode: AuthModeItem; require: RequireGate; onConfigure: () => void; onRemove: () => void }): React.JSX.Element {
  const setMode = useSetAuthModeMutation();
  const isSocial = mode.kind === 'SOCIAL';

  const toggle = (next: boolean): void =>
    require(() => {
      if (isSocial && !mode.configured) return onConfigure();
      setMode.mutate(
        { method: mode.method, body: { enabled: next } },
        { onSuccess: () => toast.success(`${mode.label} ${next ? 'enabled' : 'disabled'}`), onError: error => toast.danger(error.message) },
      );
    });

  return (
    <div className={styles.listRow}>
      <div className={styles.listMain}>
        <div className={styles.listName}>
          {mode.label}
          {isSocial && (
            <StatusChip intent={mode.configured ? 'success' : 'warning'} dot>
              {mode.configured ? 'Configured' : 'Needs settings'}
            </StatusChip>
          )}
        </div>
        <div className={styles.listSub}>{mode.provider ? `${mode.description} · client ${mode.provider.clientId}` : mode.description}</div>
      </div>
      <div className={styles.listActions}>
        {isSocial && (
          <Button variant="ghost" size="sm" onClick={() => require(onConfigure)}>
            {mode.configured ? 'Edit settings' : 'Add settings'}
          </Button>
        )}
        {isSocial && mode.configured && (
          <Button variant="ghost" size="sm" onClick={() => require(onRemove)}>
            Remove
          </Button>
        )}
        <Switch checked={mode.enabled} pending={setMode.isPending} onCheckedChange={next => toggle(next === true)} />
      </div>
    </div>
  );
}

function ProviderDialog({ mode, onOpenChange }: { mode: AuthModeItem | null; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const create = useCreateGlobalIdentityProviderMutation();
  const update = useUpdateGlobalIdentityProviderMutation();
  const [form, setForm] = useState<ProviderForm>({ name: '', issuer: '', clientId: '', clientSecret: '', allowSignUp: true });
  const [ready, setReady] = useState(false);

  const kind = (mode?.method ?? 'GOOGLE') as SocialProviderKind;
  const defaults = PROVIDER_DEFAULTS[kind] ?? PROVIDER_DEFAULTS.GOOGLE;
  const existing = mode?.provider;

  if (mode && !ready) {
    setReady(true);
    setForm({
      name: existing?.name ?? mode.label,
      issuer: existing?.issuer ?? defaults.issuer,
      clientId: existing?.clientId ?? '',
      clientSecret: '',
      allowSignUp: existing?.allowSignUp ?? true,
    });
  }
  if (!mode && ready) setReady(false);

  const set = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]): void => setForm(prev => ({ ...prev, [key]: value }));

  const close = (message: string): void => {
    toast.success(message);
    onOpenChange(false);
  };

  const submit = (): void => {
    if (!mode) return;
    if (!form.name.trim() || !form.issuer.trim() || !form.clientId.trim()) {
      toast.danger('Name, issuer, and client ID are required.');
      return;
    }

    if (existing) {
      const body = { name: form.name.trim(), clientId: form.clientId.trim(), allowSignUp: form.allowSignUp, ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}) };
      update.mutate({ id: existing.id, body }, { onSuccess: () => close(`${mode.label} settings saved`), onError: error => toast.danger(error.message) });
      return;
    }

    if (!form.clientSecret) {
      toast.danger('Client secret is required.');
      return;
    }
    const body = { kind, name: form.name.trim(), issuer: form.issuer.trim(), clientId: form.clientId.trim(), clientSecret: form.clientSecret, allowSignUp: form.allowSignUp };
    create.mutate(body, { onSuccess: () => close(`${mode.label} configured — turn it on to show it on the sign-in page`), onError: error => toast.danger(error.message) });
  };

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header
          title={existing ? `Edit ${mode?.label} settings` : `Set up ${mode?.label} sign-in`}
          description="Shadow Identity verifies the upstream token against this issuer’s discovery document and JWKS. The secret is encrypted at rest and never returned."
        />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Display name" required>
              <Input value={form.name} onValueChange={value => set('name', value)} placeholder={mode?.label} />
            </FormField>
            <FormField label="Issuer" required helper={existing ? 'Issuer can’t change — remove the settings and add them again to move tenant.' : defaults.issuerHelper}>
              <Input value={form.issuer} onValueChange={value => set('issuer', value)} placeholder="https://accounts.google.com" disabled={Boolean(existing)} />
            </FormField>
            <FormField label="Client ID" required>
              <Input value={form.clientId} onValueChange={value => set('clientId', value)} />
            </FormField>
            <FormField label="Client secret" required={!existing} helper={existing ? 'Leave blank to keep the current secret.' : undefined}>
              <Input type="password" revealable value={form.clientSecret} onValueChange={value => set('clientSecret', value)} placeholder={existing ? '••••••••' : ''} />
            </FormField>
            <Switch
              label="Allow new accounts"
              description="Off makes the provider link-only: an upstream account with no match here is refused instead of creating one."
              checked={form.allowSignUp}
              onCheckedChange={value => set('allowSignUp', value === true)}
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending || update.isPending} onClick={submit}>
            {existing ? 'Save changes' : 'Save settings'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
