/**
 * Importing npm packages
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Pagination,
  Spinner,
  Statistic,
  Switch,
  Table,
  Textarea,
  toast,
} from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ArrowLeftIcon, ExternalLinkIcon } from '@/components/icons';
import { Mono, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import {
  adminApplicationMembersQueryOptions,
  adminApplicationQueryOptions,
  adminClientsQueryOptions,
  adminResourcesQueryOptions,
  type ApplicationMemberItem,
  type ClientKind,
  type UpdateApplicationBody,
  useApplicationMembersQuery,
  useApplicationQuery,
  useClientsQuery,
  useDeleteApplicationMutation,
  useRemoveApplicationMemberMutation,
  useResourcesQuery,
  useUpdateApplicationMutation,
} from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';

import styles from './console.module.css';

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/console/applications/$appId')({
  /** The open tab lives in the URL (`?tab=`) so it survives refresh and is deep-linkable; absent means overview. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const tab = search.tab;
    return { tab: tab === 'overview' || tab === 'clients' || tab === 'resources' || tab === 'roles' || tab === 'members' ? tab : undefined };
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminApplicationQueryOptions(params.appId)),
      context.queryClient.ensureQueryData(adminApplicationMembersQueryOptions(params.appId)),
      context.queryClient.ensureQueryData(adminClientsQueryOptions()),
      context.queryClient.ensureQueryData(adminResourcesQueryOptions()),
    ]),
  component: ApplicationDetailPage,
});

type Tab = 'overview' | 'clients' | 'resources' | 'roles' | 'members';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'clients', label: 'OAuth clients' },
  { key: 'resources', label: 'API resources' },
  { key: 'roles', label: 'Roles' },
  { key: 'members', label: 'Members' },
];

const CLIENT_KIND: Record<ClientKind, { label: string; intent: 'info' | 'neutral' }> = {
  WEB_CONFIDENTIAL: { label: 'Server', intent: 'neutral' },
  SPA_PUBLIC: { label: 'Browser', intent: 'info' },
  NATIVE_PUBLIC: { label: 'Native', intent: 'info' },
  SERVICE: { label: 'Service', intent: 'neutral' },
};

const MEMBERS_PAGE_SIZE = 25;

function memberLabel(member: ApplicationMemberItem): string {
  return member.primaryEmail ?? member.username ?? member.userId;
}

function memberSub(member: ApplicationMemberItem): string | undefined {
  return !member.primaryEmail && member.username ? 'username · no email on file' : undefined;
}

function ApplicationDetailPage(): React.JSX.Element {
  const { appId } = Route.useParams();
  const { tab = 'overview' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const app = useApplicationQuery(appId);
  const members = useApplicationMembersQuery(appId);
  const clientsQuery = useClientsQuery();
  const resourcesQuery = useResourcesQuery();
  const update = useUpdateApplicationMutation();
  const del = useDeleteApplicationMutation();
  const removeMember = useRemoveApplicationMemberMutation();
  const { require, dialog } = useStepUpGate();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<UpdateApplicationBody>({});
  const [memberSearch, setMemberSearch] = useState('');
  const [membersPage, setMembersPage] = useState(1);

  const data = app.data;
  const clients = useMemo(() => (clientsQuery.data?.items ?? []).filter(client => client.applicationId === data?.id), [clientsQuery.data, data?.id]);
  const resources = useMemo(() => (resourcesQuery.data?.items ?? []).filter(resource => resource.applicationId === data?.id), [resourcesQuery.data, data?.id]);
  const allMembers = members.data?.items ?? [];
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return allMembers;
    return allMembers.filter(member => (member.primaryEmail ?? '').toLowerCase().includes(query) || (member.username ?? '').toLowerCase().includes(query));
  }, [allMembers, memberSearch]);
  const pagedMembers = filteredMembers.slice((membersPage - 1) * MEMBERS_PAGE_SIZE, membersPage * MEMBERS_PAGE_SIZE);

  if (app.isLoading || !data)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spinner size="lg" label="Loading application" />
      </div>
    );

  const counts: Record<Tab, number | undefined> = {
    overview: undefined,
    clients: clients.length,
    resources: resources.length,
    roles: data.roles.length,
    members: allMembers.length,
  };
  const homeLabel = data.homePageUrl ? data.homePageUrl.replace(/^https?:\/\//, '') : `${data.subDomain}.shadow-apps.com`;
  const homeUrl = data.homePageUrl || `https://${data.subDomain}.shadow-apps.com`;

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

  const toggleActive = (): void =>
    require(() =>
      update.mutate(
        { appId, body: { isActive: !data.isActive } },
        {
          onSuccess: () => toast.success(data.isActive ? 'Application deactivated' : 'Application activated'),
          onError: error => toast.danger(error.message),
        },
      ),
    );

  return (
    <div className={styles.page}>
      <button className={styles.backLink} onClick={() => navigate({ to: '/console/applications' })}>
        <ArrowLeftIcon size={15} />
        Back to applications
      </button>

      <div className={styles.detailHead}>
        <Avatar name={data.displayName ?? data.name} shape="square" size="xl" />
        <div className={styles.detailHeadMain}>
          <div className={styles.detailEyebrow}>Application</div>
          <div className={styles.detailName}>
            {data.displayName ?? data.name}
            <StatusChip intent={data.isActive ? 'success' : 'neutral'} dot>
              {data.isActive ? 'Active' : 'Inactive'}
            </StatusChip>
          </div>
          <div className={styles.detailMeta}>
            <span className={styles.detailMetaId}>{data.name}</span>
            <span>· Created {formatDate(data.createdAt)}</span>
          </div>
        </div>
        <a className={styles.homeLink} href={homeUrl} target="_blank" rel="noreferrer">
          {homeLabel}
          <ExternalLinkIcon size={14} />
        </a>
      </div>

      <div className={styles.appTabs}>
        {TABS.map(item => (
          <button
            key={item.key}
            className={styles.appTab}
            data-active={tab === item.key || undefined}
            onClick={() => navigate({ search: prev => ({ ...prev, tab: item.key }), replace: true })}
          >
            {item.label}
            {counts[item.key] != null && <span className={styles.tabCountPill}>{counts[item.key]}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className={styles.overview}>
          <div className={styles.actionBar}>
            <Button variant="secondary" size="sm" onClick={openEdit}>
              Edit application
            </Button>
            <Button variant="secondary" size="sm" loading={update.isPending} onClick={toggleActive}>
              {data.isActive ? 'Deactivate' : 'Activate'}
            </Button>
            <div className={styles.spacer} />
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete application…
            </Button>
          </div>

          <Alert intent="info" title="Membership is automatic">
            Members are enrolled the first time they authorise one of this application’s OAuth clients. Removing a member deletes only that usage record — it doesn’t touch their
            account or OAuth grants.
          </Alert>

          <div className={styles.overviewGrid}>
            <div className={styles.detailCard}>
              <DescriptionList layout="row" termWidth={130} title="Application">
                <DescriptionList.Item term="Application ID" mono copyable>
                  {String(data.id)}
                </DescriptionList.Item>
                <DescriptionList.Item term="Name" mono>
                  {data.name}
                </DescriptionList.Item>
                <DescriptionList.Item term="Status">
                  <StatusChip intent={data.isActive ? 'success' : 'neutral'} dot>
                    {data.isActive ? 'Active' : 'Inactive'}
                  </StatusChip>
                </DescriptionList.Item>
                <DescriptionList.Item term="Home URL">{homeLabel}</DescriptionList.Item>
                <DescriptionList.Item term="Description">{data.description || '—'}</DescriptionList.Item>
                <DescriptionList.Item term="Created">{formatDate(data.createdAt)}</DescriptionList.Item>
                <DescriptionList.Item term="Last activity">{relativeTime(data.updatedAt)}</DescriptionList.Item>
              </DescriptionList>
            </div>

            <div className={styles.glanceCard}>
              <div className={styles.glanceTitle}>At a glance</div>
              <Statistic label="Members" value={allMembers.length} />
              <div className={styles.glanceRow}>
                <Statistic label="OAuth clients" value={clients.length} size="sm" />
                <Statistic label="API resources" value={resources.length} size="sm" />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'clients' && (
        <div className={styles.page}>
          <div className={styles.tabHead}>
            <div className={styles.tabHeadMain}>
              <h2 className={styles.tabTitle}>OAuth clients</h2>
              <p className={styles.tabDesc}>
                Clients belonging to this application. Manage every client platform-wide in <Link to="/console/clients">OAuth clients</Link>.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate({ to: '/console/clients' })}>
              Create client
            </Button>
          </div>
          <div className={styles.tableCard}>
            <Table
              data={clients}
              rowKey="id"
              loading={clientsQuery.isLoading}
              aria-label="OAuth clients"
              emptyState={
                <EmptyState
                  size="inline"
                  title="No clients yet"
                  description="Register a client for this application from the OAuth clients page."
                  action={{ label: 'Create client', onClick: () => navigate({ to: '/console/clients' }) }}
                />
              }
              columns={[
                { id: 'name', header: 'Name', cell: client => <span className={styles.cellName}>{client.name}</span> },
                {
                  id: 'kind',
                  header: 'Type',
                  cell: client => <Badge intent={CLIENT_KIND[client.kind].intent}>{CLIENT_KIND[client.kind].label}</Badge>,
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
                { id: 'id', header: 'Client ID', cell: client => <Mono>{client.id}</Mono> },
              ]}
            />
          </div>
        </div>
      )}

      {tab === 'resources' && (
        <div className={styles.page}>
          <div className={styles.tabHead}>
            <div className={styles.tabHeadMain}>
              <h2 className={styles.tabTitle}>API resources</h2>
              <p className={styles.tabDesc}>Audiences this application issues access tokens for, and the scopes they expose.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate({ to: '/console/resources' })}>
              Add resource
            </Button>
          </div>
          {resources.length === 0 ? (
            <div className={styles.detailCard}>
              <EmptyState
                size="inline"
                title="No API resources"
                description="Register an API resource for this application from the API resources page."
                action={{ label: 'Add resource', onClick: () => navigate({ to: '/console/resources' }) }}
              />
            </div>
          ) : (
            <div className={styles.resourceList}>
              {resources.map(resource => (
                <div key={resource.id} className={styles.resourceCard}>
                  <div className={styles.resourceHead}>
                    <div>
                      <div className={styles.resourceName}>{resource.displayName ?? resource.identifier}</div>
                      <div className={styles.mono} style={{ marginTop: 2 }}>
                        {resource.identifier}
                      </div>
                    </div>
                  </div>
                  {resource.scopes.length > 0 ? (
                    <div className={styles.scopeRow}>
                      {resource.scopes.map(scope => (
                        <Badge key={scope.id} variant="outline">
                          {scope.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyScopes}>No scopes defined.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <div className={styles.page}>
          <div className={styles.tabHead}>
            <div className={styles.tabHeadMain}>
              <h2 className={styles.tabTitle}>Roles</h2>
              <p className={styles.tabDesc}>Roles assigned to members and included in tokens issued for this application.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate({ to: '/console/roles' })}>
              Manage roles
            </Button>
          </div>
          <div className={styles.tableCard}>
            <Table
              data={data.roles}
              rowKey="id"
              aria-label="Roles"
              emptyState={<EmptyState size="inline" title="No roles" description="This application has not published any roles through the platform catalog." />}
              columns={[
                { id: 'roleName', header: 'Role', cell: role => <span className={styles.cellName}>{role.roleName}</span> },
                { id: 'description', header: 'Description', cell: role => <span className={styles.muted}>{role.description || '—'}</span> },
              ]}
            />
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className={styles.page}>
          <div>
            <div className={styles.tabTitleRow}>
              <h2 className={styles.tabTitle}>Members</h2>
              <span className={styles.tabTitleCount}>{allMembers.length} members</span>
            </div>
            <p className={styles.tabDesc}>
              People enrolled by first authorising one of this application’s OAuth clients. Identified by primary email, or username where no email is on file.
            </p>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <Input
                size="sm"
                placeholder="Search members by email or username…"
                value={memberSearch}
                onValueChange={value => {
                  setMemberSearch(value);
                  setMembersPage(1);
                }}
              />
            </div>
          </div>
          <div className={styles.tableCard}>
            <Table
              data={pagedMembers}
              rowKey="userId"
              loading={members.isLoading}
              aria-label="Members"
              emptyState={
                <EmptyState
                  size="inline"
                  title="No members yet"
                  description="When someone first authorises one of this application’s OAuth clients, they’ll be enrolled here automatically."
                />
              }
              columns={[
                {
                  id: 'member',
                  header: 'Member',
                  cell: member => (
                    <div className={styles.cell}>
                      <Avatar name={memberLabel(member)} size="sm" />
                      <div className={styles.cellMain}>
                        <div className={styles.cellName}>{memberLabel(member)}</div>
                        {memberSub(member) && <div className={styles.memberSub}>{memberSub(member)}</div>}
                      </div>
                    </div>
                  ),
                },
                { id: 'firstUsedAt', header: 'First used', cell: member => <span className={styles.muted}>{formatDate(member.firstUsedAt)}</span> },
                { id: 'lastUsedAt', header: 'Last used', cell: member => <span className={styles.muted}>{relativeTime(member.lastUsedAt)}</span> },
                {
                  id: 'actions',
                  header: '',
                  align: 'end',
                  cell: member => (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        require(() =>
                          removeMember.mutate(
                            { appId, userId: member.userId },
                            { onSuccess: () => toast.success('Member removed'), onError: error => toast.danger(error.message) },
                          ),
                        )
                      }
                    >
                      Remove
                    </Button>
                  ),
                },
              ]}
            />
            {filteredMembers.length > MEMBERS_PAGE_SIZE && (
              <div className={styles.tableFoot}>
                <Pagination page={membersPage} total={filteredMembers.length} pageSize={MEMBERS_PAGE_SIZE} onPageChange={setMembersPage} />
              </div>
            )}
          </div>
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
