/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Avatar, Button, Dialog, FormField, Input, Table, Textarea, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { PageHeader, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { adminApplicationsQueryOptions, useApplicationsQuery, useCreateApplicationMutation } from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from './console.module.css';

export const Route = createFileRoute('/console/applications')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminApplicationsQueryOptions()),
  component: ApplicationsPage,
});

function CreateAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const create = useCreateApplicationMutation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [subDomain, setSubDomain] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');

  const submit = (): void => {
    if (!name.trim() || !subDomain.trim()) {
      toast.danger('Name and subdomain are required.');
      return;
    }
    create.mutate(
      { name: name.trim(), subDomain: subDomain.trim(), displayName: displayName.trim() || undefined, description: description.trim() || undefined },
      {
        onSuccess: result => {
          toast.success('Application created');
          onOpenChange(false);
          navigate({ to: '/console/applications/$appId', params: { appId: String(result.id) } });
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="New application" description="An application groups its OAuth clients, API resources, roles, and members." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Name" required helper="Lowercase slug — the immutable machine identifier.">
              <Input value={name} onValueChange={setName} placeholder="acme-analytics" autoFocus />
            </FormField>
            <FormField label="Subdomain" required>
              <Input prefix="https://" suffix=".shadow-apps.com" value={subDomain} onValueChange={setSubDomain} placeholder="acme" />
            </FormField>
            <FormField label="Display name">
              <Input value={displayName} onValueChange={setDisplayName} placeholder="Acme Analytics" />
            </FormField>
            <FormField label="Description">
              <Textarea value={description} onValueChange={setDescription} minRows={2} />
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

  const rows = apps.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Applications"
        subtitle="Every product on the platform — their clients, resources, roles, and members."
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
          onRowClick={app => navigate({ to: '/console/applications/$appId', params: { appId: String(app.id) } })}
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
            { id: 'created', header: 'Created', cell: app => <span className={styles.muted}>{formatDate(app.createdAt)}</span> },
          ]}
        />
      </div>

      <CreateAppDialog open={createOpen} onOpenChange={setCreateOpen} />
      {dialog}
    </div>
  );
}
