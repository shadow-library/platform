/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Avatar, Button, Dialog, FormField, Input, Table, Textarea, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { PageHeader, StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import { useStepUpGate } from '@/features/portal';
import {
  adminApplicationsQueryOptions,
  type ApplicationVisibility,
  type CreateApplicationResponse,
  useApplicationsQuery,
  useCreateApplicationMutation,
  useRootDomain,
} from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from './console.module.css';

/** Platform visibility, shown at a glance in the list (details and the selector live on the application page). */
const VISIBILITY: Record<ApplicationVisibility, { label: string; intent: 'success' | 'warning' | 'info' }> = {
  PUBLIC: { label: 'Public', intent: 'success' },
  RESTRICTED: { label: 'Restricted', intent: 'warning' },
  INTERNAL: { label: 'Internal', intent: 'info' },
};

export const Route = createFileRoute('/console/applications/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminApplicationsQueryOptions()),
  component: ApplicationsPage,
});

/**
 * Creating an application provisions its single OAuth client and its `api://<app>` resource server-side
 * (D-21, T-807): there is no separate client or resource to register. The returned secret is the client's,
 * shown exactly once here; everything else is edited later from the application page.
 */
function CreateAppDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateApplicationResponse) => void;
}): React.JSX.Element {
  const create = useCreateApplicationMutation();
  const rootDomain = useRootDomain();
  const [name, setName] = useState('');
  const [subDomain, setSubDomain] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [publicUrls, setPublicUrls] = useState<TokenValue[]>([]);

  const reset = (): void => {
    setName('');
    setSubDomain('');
    setDisplayName('');
    setDescription('');
    setPublicUrls([]);
  };

  const submit = (): void => {
    if (!name.trim() || !subDomain.trim()) {
      toast.danger('Name and subdomain are required.');
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        subDomain: subDomain.trim(),
        displayName: displayName.trim() || undefined,
        description: description.trim() || undefined,
        publicUrls: publicUrls.filter(token => token.valid).map(token => token.value),
      },
      {
        onSuccess: result => {
          toast.success('Application created');
          onOpenChange(false);
          reset();
          onCreated(result);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="New application" description="Provisions the application together with its OAuth client and api:// resource — no separate objects to register." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Name" required helper="Lowercase slug — the immutable machine identifier.">
              <Input value={name} onValueChange={setName} placeholder="acme-analytics" autoFocus />
            </FormField>
            <FormField label="Subdomain" required>
              <Input prefix="https://" suffix={`.${rootDomain}`} value={subDomain} onValueChange={setSubDomain} placeholder="acme" />
            </FormField>
            <FormField label="Display name">
              <Input value={displayName} onValueChange={setDisplayName} placeholder="Acme Analytics" />
            </FormField>
            <FormField label="Description">
              <Textarea value={description} onValueChange={setDescription} minRows={2} />
            </FormField>
            <FormField label="Public URLs" helper="Optional browser origins; each derives a callback redirect URI. You can add these later.">
              <TokenInput
                value={publicUrls}
                onValueChange={setPublicUrls}
                placeholder="https://acme.example.com"
                validate={value => /^https?:\/\//.test(value) || 'Must be a URL'}
              />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Create application
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function ApplicationsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const apps = useApplicationsQuery();
  const { require, dialog } = useStepUpGate();
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreateApplicationResponse | null>(null);

  const rows = apps.data?.items ?? [];

  const goToApp = (id: number): void => void navigate({ to: '/console/applications/$appId', params: { appId: String(id) } });

  /**
   * The provisioned client's secret is shown once; only then do we open the new application. A client
   * without a secret (there shouldn't be one here) skips straight through.
   */
  const onCreated = (result: CreateApplicationResponse): void => {
    if (result.clientSecret) setCreated(result);
    else goToApp(result.id);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Applications"
        subtitle="Every product on the platform — each with its own client, API resource, roles, and members."
        actions={
          <Button variant="primary" prefix={<PlusIcon size={15} />} onClick={() => require(() => setCreateOpen(true))}>
            New application
          </Button>
        }
      />

      <div className={styles.tableCard}>
        <Table
          data={rows}
          rowKey="id"
          loading={apps.isLoading}
          aria-label="Applications"
          onRowClick={app => goToApp(app.id)}
          emptyState={<div style={{ padding: 32, textAlign: 'center', color: 'var(--sh-text-tertiary)' }}>No applications yet.</div>}
          columns={[
            {
              id: 'name',
              header: 'Application',
              cell: app => (
                <div className={styles.cell}>
                  <Avatar name={app.displayName ?? app.name} shape="square" size="sm" />
                  <div className={styles.cellMain}>
                    <div className={styles.cellName}>{app.displayName ?? app.name}</div>
                    <div className={styles.cellSub}>{app.subDomain}.shadow-apps.com</div>
                  </div>
                </div>
              ),
            },
            {
              id: 'status',
              header: 'Status',
              cell: app => (
                <StatusChip intent={app.isActive ? 'success' : 'neutral'} dot>
                  {app.isActive ? 'Active' : 'Inactive'}
                </StatusChip>
              ),
            },
            { id: 'visibility', header: 'Visibility', cell: app => <StatusChip intent={VISIBILITY[app.visibility].intent}>{VISIBILITY[app.visibility].label}</StatusChip> },
            { id: 'created', header: 'Created', cell: app => <span className={styles.muted}>{formatDate(app.createdAt)}</span> },
          ]}
        />
      </div>

      <CreateAppDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onCreated} />
      <SecretDialog
        open={created !== null}
        onOpenChange={open => {
          if (open) return;
          const id = created?.id;
          setCreated(null);
          if (id != null) goToApp(id);
        }}
        title="Application client secret"
        description="This is the only time this application’s client secret is shown. Store it securely — you can rotate it later from the Credentials tab."
        secret={created?.clientSecret ?? undefined}
        downloadName={`${created?.clientId ?? 'client'}-secret.txt`}
      />
      {dialog}
    </div>
  );
}
