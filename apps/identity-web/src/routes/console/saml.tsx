/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, ConfirmDialog, Dialog, FormField, Input, Select, Switch, Textarea, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import {
  type SamlNameIdFormat,
  type ServiceProviderItem,
  serviceProvidersQueryOptions,
  useCreateServiceProviderMutation,
  useDeleteServiceProviderMutation,
  useServiceProvidersQuery,
  useUpdateServiceProviderMutation,
} from '@/lib/apis';

import styles from './console.module.css';

export const Route = createFileRoute('/console/saml')({
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceProvidersQueryOptions()),
  component: SamlPage,
});

function SpDialog({ editing, open, onOpenChange }: { editing: ServiceProviderItem | null; open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const create = useCreateServiceProviderMutation();
  const update = useUpdateServiceProviderMutation();
  const [entityId, setEntityId] = useState('');
  const [name, setName] = useState('');
  const [acsUrl, setAcsUrl] = useState('');
  const [nameIdFormat, setNameIdFormat] = useState<SamlNameIdFormat>('EMAIL');
  const [attributes, setAttributes] = useState<TokenValue[]>([]);
  const [cert, setCert] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [ready, setReady] = useState(false);

  if (open && !ready) {
    setReady(true);
    setEntityId(editing?.entityId ?? '');
    setName(editing?.name ?? '');
    setAcsUrl(editing?.acsUrl ?? '');
    setNameIdFormat(editing?.nameIdFormat ?? 'EMAIL');
    setAttributes((editing?.releasedAttributes ?? ['email', 'first_name', 'last_name']).map(value => ({ value, valid: true })));
    setCert('');
    setIsActive(editing?.isActive ?? true);
  }
  if (!open && ready) setReady(false);

  const submit = (): void => {
    const releasedAttributes = attributes.filter(token => token.valid).map(token => token.value);
    if (editing) {
      update.mutate(
        { id: editing.id, body: { name: name.trim(), acsUrl: acsUrl.trim(), nameIdFormat, releasedAttributes, isActive } },
        {
          onSuccess: () => {
            toast.success('Service provider updated');
            onOpenChange(false);
          },
          onError: error => toast.danger(error.message),
        },
      );
    } else {
      if (!entityId.trim() || !name.trim() || !acsUrl.trim()) {
        toast.danger('Entity ID, name, and ACS URL are required.');
        return;
      }
      create.mutate(
        { entityId: entityId.trim(), name: name.trim(), acsUrl: acsUrl.trim(), nameIdFormat, releasedAttributes, spCertificatePem: cert.trim() || undefined },
        {
          onSuccess: () => {
            toast.success('Service provider added');
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
        <Dialog.Header
          title={editing ? 'Edit SAML service provider' : 'Add SAML service provider'}
          description="Register an SP that consumes signed SAML assertions from Shadow Identity."
        />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Entity ID" required helper={editing ? 'Entity ID can’t change.' : undefined}>
              <Input value={entityId} onValueChange={setEntityId} placeholder="https://sp.example.com/saml/metadata" disabled={Boolean(editing)} />
            </FormField>
            <FormField label="Display name" required>
              <Input value={name} onValueChange={setName} placeholder="Example SP" />
            </FormField>
            <FormField label="ACS URL" required helper="Assertion Consumer Service endpoint (https).">
              <Input value={acsUrl} onValueChange={setAcsUrl} placeholder="https://sp.example.com/saml/acs" />
            </FormField>
            <FormField label="NameID format">
              <Select value={nameIdFormat} onValueChange={value => setNameIdFormat(value as SamlNameIdFormat)}>
                <Select.Item value="EMAIL">Email address</Select.Item>
                <Select.Item value="PERSISTENT">Persistent (pairwise)</Select.Item>
              </Select>
            </FormField>
            <FormField label="Released attributes">
              <TokenInput value={attributes} onValueChange={setAttributes} placeholder="email" />
            </FormField>
            {!editing && (
              <FormField label="SP certificate (PEM)" helper="Optional — for signed requests.">
                <Textarea value={cert} onValueChange={setCert} minRows={3} placeholder="-----BEGIN CERTIFICATE-----" />
              </FormField>
            )}
            {editing && <Switch label="Active" checked={isActive} onCheckedChange={value => setIsActive(value === true)} />}
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

function SamlPage(): React.JSX.Element {
  const providers = useServiceProvidersQuery();
  const del = useDeleteServiceProviderMutation();
  const { require, dialog } = useStepUpGate();
  const [editing, setEditing] = useState<ServiceProviderItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceProviderItem | null>(null);

  const list = providers.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="SAML providers"
        subtitle="Service providers that receive SAML 2.0 assertions from the identity server."
        actions={
          <Button
            variant="primary"
            prefix={<PlusIcon size={15} />}
            onClick={() =>
              require(() => {
                setEditing(null);
                setFormOpen(true);
              })
            }
          >
            Add provider
          </Button>
        }
      />

      <QueryState
        isLoading={providers.isLoading}
        error={providers.error}
        isEmpty={list.length === 0}
        emptyTitle="No SAML providers"
        emptyDescription="Register a service provider to enable SP-initiated SSO."
      >
        <div className={styles.rowList}>
          {list.map(sp => (
            <div key={sp.id} className={styles.listRow}>
              <div className={styles.listMain}>
                <div className={styles.listName}>
                  {sp.name}
                  <StatusChip intent={sp.isActive ? 'success' : 'neutral'} dot>
                    {sp.isActive ? 'Active' : 'Inactive'}
                  </StatusChip>
                </div>
                <div className={styles.listSub}>
                  {sp.entityId} · ACS {sp.acsUrl}
                </div>
              </div>
              <div className={styles.listActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    require(() => {
                      setEditing(sp);
                      setFormOpen(true);
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => require(() => setDeleteTarget(sp))}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </QueryState>

      <SpDialog editing={editing} open={formOpen} onOpenChange={setFormOpen} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => !open && setDeleteTarget(null)}
        intent="danger"
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete provider?'}
        description="The service provider will no longer be able to receive assertions."
        confirmLabel="Delete provider"
        loading={del.isPending}
        onConfirm={() =>
          deleteTarget &&
          del.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success('Provider deleted');
              setDeleteTarget(null);
            },
            onError: error => toast.danger(error.message),
          })
        }
      />
      {dialog}
    </div>
  );
}
