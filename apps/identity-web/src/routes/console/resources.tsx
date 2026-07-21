/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Dialog, FormField, Input, Select, Switch, Tag, Textarea, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { adminApplicationsQueryOptions, adminResourcesQueryOptions, useApplicationsQuery, useCreateResourceMutation, useCreateScopeMutation, useResourcesQuery } from '@/lib/apis';

import styles from './console.module.css';

export const Route = createFileRoute('/console/resources')({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(adminApplicationsQueryOptions()), context.queryClient.ensureQueryData(adminResourcesQueryOptions())]),
  component: ResourcesPage,
});

function CreateResourceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const apps = useApplicationsQuery();
  const create = useCreateResourceMutation();
  const [applicationId, setApplicationId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');

  const submit = (): void => {
    if (!applicationId || !identifier.trim()) {
      toast.danger('Choose an application and an identifier.');
      return;
    }
    create.mutate(
      { applicationId: Number(applicationId), identifier: identifier.trim(), displayName: displayName.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Resource created');
          onOpenChange(false);
          setIdentifier('');
          setDisplayName('');
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="Add API resource" description="A resource is an API that scopes protect." />
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
            <FormField label="Identifier" required helper="A URI or unique name, e.g. https://api.example.com.">
              <Input value={identifier} onValueChange={setIdentifier} placeholder="https://api.example.com" />
            </FormField>
            <FormField label="Display name">
              <Input value={displayName} onValueChange={setDisplayName} placeholder="Example API" />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Add resource
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function AddScopeDialog({ resourceId, open, onOpenChange }: { resourceId: string | null; open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const create = useCreateScopeMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [principalType, setPrincipalType] = useState<'USER' | 'SERVICE' | 'BOTH'>('BOTH');

  const submit = (): void => {
    if (!resourceId || !name.trim()) return;
    create.mutate(
      { resourceId, body: { name: name.trim(), description: description.trim() || undefined, isSensitive: sensitive, principalType } },
      {
        onSuccess: () => {
          toast.success('Scope added');
          onOpenChange(false);
          setName('');
          setDescription('');
          setSensitive(false);
          setPrincipalType('BOTH');
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header title="Add scope" />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Scope name" required>
              <Input value={name} onValueChange={setName} placeholder="read:orders" autoFocus />
            </FormField>
            <FormField label="Description">
              <Textarea value={description} onValueChange={setDescription} minRows={2} placeholder="Read a customer’s orders" />
            </FormField>
            <FormField label="Who may hold it" helper="Service scopes never reach a user token or the consent screen; user scopes never reach a service token.">
              <Select value={principalType} onValueChange={value => setPrincipalType(value as 'USER' | 'SERVICE' | 'BOTH')}>
                <Select.Item value="BOTH">Users and services</Select.Item>
                <Select.Item value="USER">Users only</Select.Item>
                <Select.Item value="SERVICE">Services only (M2M)</Select.Item>
              </Select>
            </FormField>
            <Switch label="Sensitive" description="Shown prominently on the consent screen." checked={sensitive} onCheckedChange={value => setSensitive(value === true)} />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Add scope
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function ResourcesPage(): React.JSX.Element {
  const resources = useResourcesQuery();
  const { require, dialog } = useStepUpGate();
  const [createOpen, setCreateOpen] = useState(false);
  const [scopeFor, setScopeFor] = useState<string | null>(null);

  const list = resources.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="API resources & scopes"
        subtitle="APIs protected by Shadow Identity and the scopes clients can request."
        actions={
          <Button variant="primary" prefix={<PlusIcon size={15} />} onClick={() => require(() => setCreateOpen(true))}>
            Add resource
          </Button>
        }
      />

      <QueryState
        isLoading={resources.isLoading}
        error={resources.error}
        isEmpty={list.length === 0}
        emptyTitle="No API resources"
        emptyDescription="Register an API resource to define its scopes."
      >
        <div className={styles.resourceList}>
          {list.map(resource => (
            <div key={resource.id} className={styles.resourceCard}>
              <div className={styles.resourceHead}>
                <div>
                  <div className={styles.resourceName}>{resource.displayName ?? resource.identifier}</div>
                  <div className={styles.mono}>{resource.identifier}</div>
                </div>
                <Button variant="secondary" size="sm" prefix={<PlusIcon size={14} />} onClick={() => require(() => setScopeFor(resource.id))}>
                  Add scope
                </Button>
              </div>
              <div className={styles.scopeRow}>
                {resource.scopes.length === 0 ? (
                  <span className={styles.emptyScopes}>No scopes yet.</span>
                ) : (
                  resource.scopes.map(scope => (
                    <span key={scope.id} className={styles.scopeTag}>
                      <Tag>{scope.name}</Tag>
                      {scope.principalType !== 'BOTH' && <StatusChip intent="neutral">{scope.principalType === 'SERVICE' ? 'M2M' : 'user'}</StatusChip>}
                      {scope.isSensitive && <StatusChip intent="warning">sensitive</StatusChip>}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </QueryState>

      <CreateResourceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AddScopeDialog resourceId={scopeFor} open={scopeFor !== null} onOpenChange={open => !open && setScopeFor(null)} />
      {dialog}
    </div>
  );
}
