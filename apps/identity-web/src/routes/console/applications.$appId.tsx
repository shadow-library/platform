/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Avatar, Button, ConfirmDialog, DescriptionList, Dialog, FormField, Input, Spinner, Switch, Textarea, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ArrowLeftIcon, PlusIcon, ShieldCheckIcon } from '@/components/icons';
import { StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import {
  adminApplicationMembersQueryOptions,
  adminApplicationQueryOptions,
  type UpdateApplicationBody,
  useApplicationMembersQuery,
  useApplicationQuery,
  useCreateRoleMutation,
  useDeleteApplicationMutation,
  useRemoveApplicationMemberMutation,
  useUpdateApplicationMutation,
} from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';

import styles from './console.module.css';

export const Route = createFileRoute('/console/applications/$appId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminApplicationQueryOptions(params.appId)),
      context.queryClient.ensureQueryData(adminApplicationMembersQueryOptions(params.appId)),
    ]),
  component: ApplicationDetailPage,
});

type Tab = 'overview' | 'roles' | 'members';

function ApplicationDetailPage(): React.JSX.Element {
  const { appId } = Route.useParams();
  const navigate = useNavigate();
  const app = useApplicationQuery(appId);
  const members = useApplicationMembersQuery(appId);
  const update = useUpdateApplicationMutation();
  const del = useDeleteApplicationMutation();
  const createRole = useCreateRoleMutation();
  const removeMember = useRemoveApplicationMemberMutation();
  const { require, dialog } = useStepUpGate();

  const [tab, setTab] = useState<Tab>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [form, setForm] = useState<UpdateApplicationBody>({});

  const data = app.data;

  if (app.isLoading || !data)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spinner size="lg" label="Loading application" />
      </div>
    );

  const openEdit = (): void =>
    require(() => {
      setForm({
        displayName: data.displayName ?? '',
        subDomain: data.subDomain,
        description: data.description ?? '',
        homePageUrl: data.homePageUrl ?? '',
        logoUrl: data.logoUrl ?? '',
        isActive: data.isActive,
      });
      setEditOpen(true);
    });

  const saveEdit = (): void =>
    update.mutate(
      { appId, body: form },
      {
        onSuccess: () => {
          toast.success('Application updated');
          setEditOpen(false);
        },
        onError: error => toast.danger(error.message),
      },
    );

  const addRole = (): void => {
    if (!roleName.trim()) return;
    createRole.mutate(
      { applicationId: Number(appId), roleName: roleName.trim() },
      {
        onSuccess: () => {
          toast.success('Role created');
          setRoleOpen(false);
          setRoleName('');
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <div className={styles.page} style={{ maxWidth: 920 }}>
      <button className={styles.backLink} onClick={() => navigate({ to: '/console/applications' })}>
        <ArrowLeftIcon size={15} />
        Back to applications
      </button>

      <div className={styles.detailHead}>
        <Avatar name={data.displayName ?? data.name} shape="square" size="xl" />
        <div style={{ flex: 1 }}>
          <div className={styles.detailName}>
            {data.displayName ?? data.name}
            <StatusChip intent={data.isActive ? 'success' : 'neutral'} dot>
              {data.isActive ? 'Active' : 'Inactive'}
            </StatusChip>
          </div>
          <div className={styles.detailSub}>
            {data.subDomain}.shadow-apps.com · {data.name}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={openEdit}>
          Edit
        </Button>
      </div>

      <div className={styles.appTabs}>
        {(['overview', 'roles', 'members'] as Tab[]).map(item => (
          <button key={item} className={styles.appTab} data-active={tab === item || undefined} onClick={() => setTab(item)}>
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className={styles.detailCard}>
          <DescriptionList layout="row" termWidth={150} title="Application">
            <DescriptionList.Item term="Name" mono>
              {data.name}
            </DescriptionList.Item>
            <DescriptionList.Item term="Subdomain" mono copyable>
              {data.subDomain}.shadow-apps.com
            </DescriptionList.Item>
            <DescriptionList.Item term="Description">{data.description || '—'}</DescriptionList.Item>
            <DescriptionList.Item term="Home page">{data.homePageUrl || '—'}</DescriptionList.Item>
            <DescriptionList.Item term="Application ID" mono copyable>
              {String(data.id)}
            </DescriptionList.Item>
            <DescriptionList.Item term="Created">{formatDate(data.createdAt)}</DescriptionList.Item>
            <DescriptionList.Item term="Updated">{relativeTime(data.updatedAt)}</DescriptionList.Item>
          </DescriptionList>
          <div style={{ marginTop: 16, borderTop: '1px solid var(--sh-border-subtle)', paddingTop: 16 }}>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete application…
            </Button>
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className={styles.detailCard}>
          <div className={styles.sectionHead}>
            <div className={styles.detailCardTitle}>Roles</div>
            <Button variant="secondary" size="sm" prefix={<PlusIcon size={14} />} onClick={() => require(() => setRoleOpen(true))}>
              New role
            </Button>
          </div>
          {data.roles.length === 0 ? (
            <div className={styles.empty}>No roles defined for this application.</div>
          ) : (
            data.roles.map(role => (
              <div key={role.id} className={styles.accessRow}>
                <div className={styles.accessMain}>
                  <div className={styles.accessName}>
                    <ShieldCheckIcon size={15} />
                    {role.roleName}
                  </div>
                  {role.description && <div className={styles.accessSub}>{role.description}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Members</div>
          {members.isLoading ? (
            <Spinner size="sm" />
          ) : (members.data?.items.length ?? 0) === 0 ? (
            <div className={styles.empty}>No members have used this application yet.</div>
          ) : (
            members.data?.items.map(member => (
              <div key={member.userId} className={styles.accessRow}>
                <div className={styles.cell}>
                  <Avatar name={member.primaryEmail ?? member.username ?? member.userId} size="sm" />
                  <div className={styles.cellMain}>
                    <div className={styles.cellName}>{member.username ?? member.primaryEmail ?? member.userId}</div>
                    <div className={styles.cellSub}>Last used {relativeTime(member.lastUsedAt)}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    require(() =>
                      removeMember.mutate({ appId, userId: member.userId }, { onSuccess: () => toast.success('Member removed'), onError: error => toast.danger(error.message) }),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <Dialog.Content size="md">
          <Dialog.Header title="Edit application" />
          <Dialog.Body>
            <div className={styles.form}>
              <FormField label="Display name">
                <Input value={form.displayName ?? ''} onValueChange={value => setForm(prev => ({ ...prev, displayName: value }))} />
              </FormField>
              <FormField label="Subdomain">
                <Input suffix=".shadow-apps.com" value={form.subDomain ?? ''} onValueChange={value => setForm(prev => ({ ...prev, subDomain: value }))} />
              </FormField>
              <FormField label="Description">
                <Textarea minRows={2} value={form.description ?? ''} onValueChange={value => setForm(prev => ({ ...prev, description: value }))} />
              </FormField>
              <FormField label="Home page URL">
                <Input value={form.homePageUrl ?? ''} onValueChange={value => setForm(prev => ({ ...prev, homePageUrl: value }))} />
              </FormField>
              <Switch label="Active" checked={form.isActive ?? true} onCheckedChange={value => setForm(prev => ({ ...prev, isActive: value === true }))} />
            </div>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" loading={update.isPending} onClick={saveEdit}>
              Save changes
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <Dialog.Content size="sm">
          <Dialog.Header title="New role" />
          <Dialog.Body>
            <FormField label="Role name" required>
              <Input value={roleName} onValueChange={setRoleName} placeholder="editor" autoFocus />
            </FormField>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" loading={createRole.isPending} onClick={addRole}>
              Create role
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        intent="danger"
        title={`Delete ${data.displayName ?? data.name}?`}
        description="This removes the application and its configuration. This cannot be undone."
        confirmLabel="Delete application"
        typedConfirmation={data.name}
        loading={del.isPending}
        onConfirm={() =>
          require(() =>
            del.mutate(appId, {
              onSuccess: () => {
                toast.success('Application deleted');
                setDeleteOpen(false);
                navigate({ to: '/console/applications' });
              },
              onError: error => toast.danger(error.message),
            }),
          )
        }
      />
      {dialog}
    </div>
  );
}
