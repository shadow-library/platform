/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge, Button, Dialog, FormField, Input, Select, Switch, Table, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { Mono, PageHeader, StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import { useStepUpGate } from '@/features/portal';
import { adminApplicationsQueryOptions, adminClientsQueryOptions, type ClientKind, useApplicationsQuery, useClientsQuery, useRegisterClientMutation } from '@/lib/apis';

import styles from './console.module.css';

export const Route = createFileRoute('/console/clients/')({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(adminApplicationsQueryOptions()), context.queryClient.ensureQueryData(adminClientsQueryOptions())]),
  component: ClientsPage,
});

const KINDS: { value: ClientKind; label: string }[] = [
  { value: 'WEB_CONFIDENTIAL', label: 'Web (confidential)' },
  { value: 'SPA_PUBLIC', label: 'SPA (public)' },
  { value: 'NATIVE_PUBLIC', label: 'Native (public)' },
  { value: 'SERVICE', label: 'Service (machine-to-machine)' },
];

const CLIENT_KIND: Record<ClientKind, { label: string; intent: 'info' | 'neutral' }> = {
  WEB_CONFIDENTIAL: { label: 'Server', intent: 'neutral' },
  SPA_PUBLIC: { label: 'Browser', intent: 'info' },
  NATIVE_PUBLIC: { label: 'Native', intent: 'info' },
  SERVICE: { label: 'Service', intent: 'neutral' },
};

const GRANT_PRESETS: Record<string, string[]> = {
  auth_code: ['authorization_code', 'refresh_token'],
  client_credentials: ['client_credentials'],
};

/** `system:serviceaccount:<namespace>:<name>` — the subject of a projected Kubernetes SA token. */
const WORKLOAD_SUBJECT_PATTERN = /^system:serviceaccount:[a-z0-9]([-a-z0-9]*[a-z0-9])?:[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
type AuthMethod = 'client_secret' | 'workload_identity';

function RegisterDialog({ open, onOpenChange, onSecret }: { open: boolean; onOpenChange: (open: boolean) => void; onSecret: (secret: string) => void }): React.JSX.Element {
  const apps = useApplicationsQuery();
  const register = useRegisterClientMutation();
  const [applicationId, setApplicationId] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ClientKind>('WEB_CONFIDENTIAL');
  const [grant, setGrant] = useState('auth_code');
  const [redirectUris, setRedirectUris] = useState<TokenValue[]>([]);
  const [firstParty, setFirstParty] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('client_secret');
  const [workloadSubject, setWorkloadSubject] = useState('');

  const isService = kind === 'SERVICE';
  const isWorkload = isService && authMethod === 'workload_identity';

  /** Service clients only ever use the client-credentials grant; switching kind keeps the form coherent. */
  const changeKind = (value: ClientKind): void => {
    setKind(value);
    setGrant(value === 'SERVICE' ? 'client_credentials' : 'auth_code');
    if (value !== 'SERVICE') setAuthMethod('client_secret');
  };

  const submit = (): void => {
    if (!applicationId || !name.trim()) {
      toast.danger('Choose an application and a name.');
      return;
    }
    if (isWorkload && !WORKLOAD_SUBJECT_PATTERN.test(workloadSubject.trim())) {
      toast.danger('Enter a workload subject like system:serviceaccount:namespace:service-account.');
      return;
    }
    register.mutate(
      {
        applicationId: Number(applicationId),
        name: name.trim(),
        kind,
        isFirstParty: firstParty,
        grantTypes: isService ? ['client_credentials'] : (GRANT_PRESETS[grant] ?? ['authorization_code', 'refresh_token']),
        redirectUris: redirectUris.filter(token => token.valid).map(token => token.value),
        ...(isService ? { authMethod } : {}),
        ...(isWorkload ? { workloadSubject: workloadSubject.trim() } : {}),
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
              <Select value={kind} onValueChange={value => changeKind(value as ClientKind)}>
                {KINDS.map(item => (
                  <Select.Item key={item.value} value={item.value}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            {isService && (
              <FormField label="Authentication method" helper="How this machine client proves its identity when requesting tokens.">
                <Select value={authMethod} onValueChange={value => setAuthMethod(value as AuthMethod)}>
                  <Select.Item value="client_secret">Client secret</Select.Item>
                  <Select.Item value="workload_identity">Workload identity (Kubernetes service account)</Select.Item>
                </Select>
              </FormField>
            )}
            {isWorkload && (
              <FormField label="Workload subject" required helper="The pod service account presented as an RFC 7523 assertion — no secret is issued.">
                <Input value={workloadSubject} onValueChange={setWorkloadSubject} placeholder="system:serviceaccount:novel-forge:novel-forge-server" />
              </FormField>
            )}
            {!isService && (
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
  const navigate = useNavigate();
  const clients = useClientsQuery();
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
          onRowClick={client => navigate({ to: '/console/clients/$clientId', params: { clientId: client.id } })}
          emptyState={<div style={{ padding: 32, textAlign: 'center', color: 'var(--sh-text-tertiary)' }}>No clients registered yet.</div>}
          columns={[
            {
              id: 'name',
              header: 'Name',
              cell: client => (
                <div className={styles.cell}>
                  <span className={styles.cellName}>{client.name}</span>
                  {client.isFirstParty && <StatusChip intent="accent">First-party</StatusChip>}
                </div>
              ),
            },
            { id: 'kind', header: 'Type', cell: client => <Badge intent={CLIENT_KIND[client.kind].intent}>{CLIENT_KIND[client.kind].label}</Badge> },
            { id: 'id', header: 'Client ID', cell: client => <Mono>{client.id}</Mono> },
            {
              id: 'status',
              header: 'Status',
              cell: client => (
                <StatusChip intent={client.isActive ? 'success' : 'neutral'} dot>
                  {client.isActive ? 'Active' : 'Inactive'}
                </StatusChip>
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
