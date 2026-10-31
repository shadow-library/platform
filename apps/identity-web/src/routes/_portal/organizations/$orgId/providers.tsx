import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, ConfirmDialog, Dialog, FormField, Input, PlusIcon, Switch, toast } from '@shadow-library/ui';

import { GatedNotice, PageHeader, QueryState, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import {
  type IdentityProvider,
  identityProvidersQueryOptions,
  myOrganisationsQueryOptions,
  orgAccessOf,
  useCreateIdentityProviderMutation,
  useDeleteIdentityProviderMutation,
  useIdentityProvidersQuery,
  useOrgAccess,
  useUpdateIdentityProviderMutation,
} from '@/lib/apis';
import { useConfirmTarget } from '@/lib/hooks';

import styles from './providers.module.css';

/** Listing identity providers is an org-admin route, so plain members and personal workspaces skip the fetch instead of erroring the page. */
export const Route = createFileRoute('/_portal/organizations/$orgId/providers')({
  loader: async ({ context, params }) => {
    const mine = await context.queryClient.ensureQueryData(myOrganisationsQueryOptions());
    if (orgAccessOf(mine, params.orgId).canManage) await context.queryClient.ensureQueryData(identityProvidersQueryOptions(params.orgId));
  },
  component: ProvidersPage,
});

interface IdpForm {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  enforced: boolean;
  isActive: boolean;
}

const EMPTY_FORM: IdpForm = { name: '', issuer: '', clientId: '', clientSecret: '', scopes: 'openid email profile', enforced: false, isActive: true };

function IdpDialog({
  orgId,
  editing,
  open,
  onOpenChange,
}: {
  orgId: string;
  editing: IdentityProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const create = useCreateIdentityProviderMutation(orgId);
  const update = useUpdateIdentityProviderMutation(orgId);
  const [form, setForm] = useState<IdpForm>(EMPTY_FORM);
  const [ready, setReady] = useState(false);

  if (open && !ready) {
    setForm(
      editing
        ? {
            name: editing.name,
            issuer: editing.issuer,
            clientId: editing.clientId,
            clientSecret: '',
            scopes: editing.scopes,
            enforced: editing.enforced,
            isActive: editing.isActive,
          }
        : EMPTY_FORM,
    );
    setReady(true);
  }
  if (!open && ready) setReady(false);

  const set = <K extends keyof IdpForm>(key: K, value: IdpForm[K]): void => setForm(prev => ({ ...prev, [key]: value }));

  const submit = (): void => {
    if (!form.name.trim() || !form.issuer.trim() || !form.clientId.trim()) {
      toast.danger('Name, issuer, and client ID are required.');
      return;
    }
    if (editing) {
      update.mutate(
        {
          idpId: editing.id,
          body: {
            name: form.name.trim(),
            clientId: form.clientId.trim(),
            scopes: form.scopes.trim(),
            enforced: form.enforced,
            isActive: form.isActive,
            ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
          },
        },
        {
          onSuccess: () => {
            toast.success('Identity provider updated');
            onOpenChange(false);
          },
          onError: error => toast.danger(error.message),
        },
      );
    } else {
      if (!form.clientSecret.trim()) {
        toast.danger('Client secret is required.');
        return;
      }
      create.mutate(
        {
          name: form.name.trim(),
          issuer: form.issuer.trim(),
          clientId: form.clientId.trim(),
          clientSecret: form.clientSecret.trim(),
          scopes: form.scopes.trim() || undefined,
          enforced: form.enforced,
        },
        {
          onSuccess: () => {
            toast.success('Identity provider added');
            onOpenChange(false);
          },
          onError: error => toast.danger(error.message),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title={editing ? 'Edit identity provider' : 'Add identity provider'} description="Connect an OIDC provider for your members to sign in with." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Display name" required>
              <Input value={form.name} onValueChange={value => set('name', value)} placeholder="Okta" autoFocus />
            </FormField>
            <FormField
              label="Issuer URL"
              required
              helper={editing ? 'Issuer can’t be changed after creation.' : 'The provider’s OIDC issuer; endpoints are discovered automatically.'}
            >
              <Input value={form.issuer} onValueChange={value => set('issuer', value)} placeholder="https://acme.okta.com" disabled={Boolean(editing)} />
            </FormField>
            <FormField label="Client ID" required>
              <Input value={form.clientId} onValueChange={value => set('clientId', value)} />
            </FormField>
            <FormField label="Client secret" helper={editing ? 'Leave blank to keep the current secret.' : undefined} required={!editing}>
              <Input type="password" revealable value={form.clientSecret} onValueChange={value => set('clientSecret', value)} placeholder={editing ? '••••••••' : ''} />
            </FormField>
            <FormField label="Scopes" helper="Space-separated OIDC scopes.">
              <Input value={form.scopes} onValueChange={value => set('scopes', value)} />
            </FormField>
            <Switch
              label="Enforce SSO"
              description="Require members on verified domains to sign in with this provider."
              checked={form.enforced}
              onCheckedChange={value => set('enforced', value === true)}
            />
            {editing && (
              <Switch label="Active" description="Turn the provider off without deleting it." checked={form.isActive} onCheckedChange={value => set('isActive', value === true)} />
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending || update.isPending} onClick={submit}>
            {editing ? 'Save changes' : 'Add provider'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function ProvidersPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const { org, canManage } = useOrgAccess(orgId);
  const providers = useIdentityProvidersQuery(orgId, canManage);
  const del = useDeleteIdentityProviderMutation(orgId);
  const { require, dialog } = useStepUpGate();

  const [editing, setEditing] = useState<IdentityProvider | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const deletion = useConfirmTarget<IdentityProvider>();

  const list = providers.data?.items ?? [];
  const canAdd = !providers.isLoading && !providers.error && list.length === 0;

  const openCreate = (): void =>
    require(() => {
      setEditing(null);
      setFormOpen(true);
    });
  const openEdit = (idp: IdentityProvider): void =>
    require(() => {
      setEditing(idp);
      setFormOpen(true);
    });

  const header = (
    <PageHeader
      title="Single sign-on"
      subtitle="Let members sign in through your own OIDC identity provider. One provider per organization."
      actions={
        canManage &&
        canAdd && (
          <Button variant="primary" prefix={<PlusIcon size={15} />} onClick={openCreate}>
            Add provider
          </Button>
        )
      }
    />
  );

  if (!canManage)
    return (
      <>
        {header}
        <GatedNotice subject="Single sign-on settings" personal={org?.type === 'PERSONAL'} />
      </>
    );

  return (
    <>
      {header}
      <div className={styles.page}>
        <QueryState
          isLoading={providers.isLoading}
          error={providers.error}
          isEmpty={list.length === 0}
          emptyTitle="No identity provider"
          emptyDescription="Connect an OIDC provider so your members can use enterprise SSO."
        >
          <div className={styles.list}>
            {list.map(idp => (
              <div key={idp.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{idp.name}</span>
                    {idp.enforced && <StatusChip intent="warning">Enforced</StatusChip>}
                    <StatusChip intent={idp.isActive ? 'success' : 'neutral'} dot>
                      {idp.isActive ? 'Active' : 'Inactive'}
                    </StatusChip>
                  </div>
                  <div className={styles.issuer}>{idp.issuer}</div>
                </div>
                <div className={styles.cardActions}>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(idp)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deletion.ask(idp)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </QueryState>

        <IdpDialog orgId={orgId} editing={editing} open={formOpen} onOpenChange={setFormOpen} />

        <ConfirmDialog
          open={deletion.open}
          onOpenChange={deletion.onOpenChange}
          intent="danger"
          title={deletion.target ? `Delete ${deletion.target.name}?` : 'Delete provider?'}
          description="Members will no longer be able to sign in through this provider."
          confirmLabel="Delete provider"
          onConfirm={() => {
            const { target } = deletion;
            return target && require(() => del.mutateAsync(target.id, { onSuccess: () => toast.success('Provider deleted'), onError: error => toast.danger(error.message) }));
          }}
        />
        {dialog}
      </div>
    </>
  );
}
