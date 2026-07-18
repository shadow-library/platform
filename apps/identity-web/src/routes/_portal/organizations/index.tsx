/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Avatar, Badge, Button, ConfirmDialog, Dialog, FormField, Input, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { PageHeader, QueryState } from '@/components/si';
import { type MyOrganisation, myOrganisationsQueryOptions, useCreateOrganisationMutation, useLeaveOrganisationMutation, useMyOrganisationsQuery } from '@/lib/apis';

import styles from './index.module.css';

export const Route = createFileRoute('/_portal/organizations/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(myOrganisationsQueryOptions()),
  component: OrganizationsPage,
});

function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const navigate = useNavigate();
  const create = useCreateOrganisationMutation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const submit = (): void => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), ...(slug.trim() ? { slug: slug.trim() } : {}) },
      {
        onSuccess: org => {
          toast.success(`Created ${org.name}`);
          onOpenChange(false);
          setName('');
          setSlug('');
          navigate({ to: '/organizations/$orgId/settings', params: { orgId: org.id } });
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="Create an organization" description="Organizations let you share access and manage members together." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Organization name" required>
              <Input placeholder="Acme Corp" value={name} onValueChange={setName} autoFocus />
            </FormField>
            <FormField label="Slug" helper="Used in URLs and your SSO home realm. Auto-generated if left blank.">
              <Input prefix="shadow-apps.com/" placeholder="acme-corp" value={slug} onValueChange={setSlug} />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Create organization
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function OrganizationsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const orgs = useMyOrganisationsQuery();
  const leave = useLeaveOrganisationMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<MyOrganisation | null>(null);

  const list = orgs.data?.organisations ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="My organizations"
        subtitle="Teams you belong to across the ecosystem."
        actions={
          <Button variant="primary" prefix={<PlusIcon size={15} />} onClick={() => setCreateOpen(true)}>
            Create organization
          </Button>
        }
      />

      <QueryState isLoading={orgs.isLoading} error={orgs.error} isEmpty={list.length === 0} emptyTitle="No organizations yet" emptyDescription="Create one to start collaborating.">
        <div className={styles.list}>
          {list.map(org => {
            const personal = org.type === 'PERSONAL';
            return (
              <div key={org.id} className={styles.row}>
                <Avatar name={org.name} shape="square" size="lg" />
                <div className={styles.meta}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{org.name}</span>
                    {personal ? (
                      <Badge variant="outline">Personal</Badge>
                    ) : (
                      <Badge intent={org.role === 'OWNER' ? 'info' : 'neutral'}>{org.role[0] + org.role.slice(1).toLowerCase()}</Badge>
                    )}
                  </div>
                  <div className={styles.sub}>{personal ? 'Just you · can’t be deleted' : `${org.slug} · ${org.status.toLowerCase()}`}</div>
                </div>
                <div className={styles.actions}>
                  {!personal && (
                    <Button variant="ghost" size="sm" onClick={() => setLeaveTarget(org)}>
                      Leave
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => navigate({ to: '/organizations/$orgId/settings', params: { orgId: org.id } })}>
                    Open
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </QueryState>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={leaveTarget !== null}
        onOpenChange={open => !open && setLeaveTarget(null)}
        intent="danger"
        title={leaveTarget ? `Leave ${leaveTarget.name}?` : 'Leave organization?'}
        description="You’ll lose access to its resources immediately. An admin will need to re-invite you to rejoin."
        confirmLabel="Leave organization"
        loading={leave.isPending}
        onConfirm={() =>
          leaveTarget &&
          leave.mutate(leaveTarget.id, {
            onSuccess: () => {
              toast.success(`Left ${leaveTarget.name}`);
              setLeaveTarget(null);
            },
            onError: error => toast.danger(error.message),
          })
        }
      />
    </div>
  );
}
