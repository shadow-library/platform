/**
 * Importing npm packages
 */
import { Badge, Button, Dialog, DropdownMenu, FormField, IconButton, Input, Select, Switch, Table, TokenInput, type TokenValue, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { MoreIcon, PlusIcon } from '@/components/icons';
import { PageHeader, StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import { useStepUpGate } from '@/features/portal';
import { type ClientKind, useApplicationsQuery, useClientsQuery, useRegisterClientMutation, useRotateClientSecretMutation } from '@/lib/apis';

import styles from './console.module.css';

export const Route = createFileRoute('/console/clients')({
  component: ClientsPage,
});

const KINDS: { value: ClientKind; label: string }[] = [
  { value: 'WEB_CONFIDENTIAL', label: 'Web (confidential)' },
  { value: 'SPA_PUBLIC', label: 'SPA (public)' },
  { value: 'NATIVE_PUBLIC', label: 'Native (public)' },
  { value: 'SERVICE', label: 'Service (machine-to-machine)' },
];

const GRANT_PRESETS: Record<string, string[]> = {
  auth_code: ['authorization_code', 'refresh_token'],
  client_credentials: ['client_credentials'],
};

function RegisterDialog({ open, onOpenChange, onSecret }: { open: boolean; onOpenChange: (open: boolean) => void; onSecret: (secret: string) => void }): React.JSX.Element {
  const apps = useApplicationsQuery();
  const register = useRegisterClientMutation();
  const [applicationId, setApplicationId] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ClientKind>('WEB_CONFIDENTIAL');
  const [grant, setGrant] = useState('auth_code');
  const [redirectUris, setRedirectUris] = useState<TokenValue[]>([]);
  const [firstParty, setFirstParty] = useState(false);

  const submit = (): void => {
    if (!applicationId || !name.trim()) {
      toast.danger('Choose an application and a name.');
      return;
    }
    register.mutate(
      {
        applicationId: Number(applicationId),
        name: name.trim(),
        kind,
        isFirstParty: firstParty,
        grantTypes: GRANT_PRESETS[grant] ?? ['authorization_code', 'refresh_token'],
        redirectUris: redirectUris.filter(token => token.valid).map(token => token.value),
      },
      {
        onSuccess: result => {
          onOpenChange(false);
          toast.success('Client registered');
          if (result.secret) onSecret(result.secret);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="Register OAuth client" description="Create a client that can request tokens from the identity server." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Application" required>
              <Select placeholder="Select an application" value={applicationId} onValueChange={setApplicationId}>
                {(apps.data?.items ?? []).map(app => (
                  <Select.Item key={app.id} value={String(app.id)}>
                    {app.displayName ?? app.name}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <FormField label="Client name" required>
              <Input value={name} onValueChange={setName} placeholder="Production web app" />
            </FormField>
            <FormField label="Client type">
              <Select value={kind} onValueChange={value => setKind(value as ClientKind)}>
                {KINDS.map(item => (
                  <Select.Item key={item.value} value={item.value}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <FormField label="Grant types">
              <Select value={grant} onValueChange={setGrant}>
                <Select.Item value="auth_code">Authorization code + refresh</Select.Item>
                <Select.Item value="client_credentials">Client credentials</Select.Item>
              </Select>
            </FormField>
            {grant === 'auth_code' && (
              <FormField label="Redirect URIs" helper="Where the server may return the authorization code.">
                <TokenInput
                  value={redirectUris}
                  onValueChange={setRedirectUris}
                  placeholder="https://app.example.com/callback"
                  validate={value => /^https?:\/\//.test(value) || 'Must be a URL'}
                />
              </FormField>
            )}
            <Switch
              label="First-party client"
              description="Skips the consent screen for this client."
              checked={firstParty}
              onCheckedChange={value => setFirstParty(value === true)}
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={register.isPending} onClick={submit}>
            Register client
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function ClientsPage(): React.JSX.Element {
  const clients = useClientsQuery();
  const rotate = useRotateClientSecretMutation();
  const { require, dialog } = useStepUpGate();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const rows = clients.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="OAuth clients"
        subtitle="Applications and services that request tokens from Shadow Identity."
        actions={
          <Button variant="primary" prefix={<PlusIcon size={15} />} onClick={() => require(() => setRegisterOpen(true))}>
            Register client
          </Button>
        }
      />

      <div className={styles.tableCard}>
        <Table
          data={rows}
          rowKey="id"
          loading={clients.isLoading}
          aria-label="OAuth clients"
          emptyState={<div style={{ padding: 32, textAlign: 'center', color: 'var(--sh-text-tertiary)' }}>No clients registered yet.</div>}
          columns={[
            { id: 'name', header: 'Client', cell: client => <span className={styles.cellName}>{client.name}</span> },
            { id: 'kind', header: 'Type', cell: client => <Badge variant="outline">{client.kind.replace('_', ' ').toLowerCase()}</Badge> },
            {
              id: 'party',
              header: 'Party',
              cell: client => (client.isFirstParty ? <StatusChip intent="accent">First-party</StatusChip> : <StatusChip intent="neutral">Third-party</StatusChip>),
            },
            {
              id: 'status',
              header: 'Status',
              cell: client => (
                <StatusChip intent={client.isActive ? 'success' : 'neutral'} dot>
                  {client.isActive ? 'Active' : 'Inactive'}
                </StatusChip>
              ),
            },
            {
              id: 'actions',
              header: '',
              align: 'end',
              width: 56,
              cell: client => (
                <DropdownMenu>
                  <DropdownMenu.Trigger asChild>
                    <IconButton variant="ghost" size="sm" aria-label="Client actions" icon={<MoreIcon size={16} />} />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item
                      onSelect={() => require(() => rotate.mutate(client.id, { onSuccess: result => setSecret(result.secret), onError: error => toast.danger(error.message) }))}
                    >
                      Rotate secret
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              ),
            },
          ]}
        />
      </div>

      <RegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} onSecret={setSecret} />
      <SecretDialog
        open={secret !== null}
        onOpenChange={open => !open && setSecret(null)}
        title="Client secret"
        description="This is the only time the secret is shown. Store it securely — you can rotate it later."
        secret={secret ?? undefined}
        downloadName="client-secret.txt"
      />
      {dialog}
    </div>
  );
}
