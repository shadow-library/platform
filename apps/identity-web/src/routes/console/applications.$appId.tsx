import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Pagination,
  Select,
  Spinner,
  Statistic,
  Switch,
  Table,
  Textarea,
  toast,
} from '@shadow-library/ui';

import { ArrowLeftIcon, ExternalLinkIcon } from '@/components/icons';
import { type ChipIntent, StatusChip } from '@/components/si';
import { ApiScopesTab, CredentialsTab, OrganisationsTab } from '@/features/applications';
import { useStepUpGate } from '@/features/portal';
import {
  adminApplicationMembersQueryOptions,
  adminApplicationQueryOptions,
  adminClientsQueryOptions,
  adminResourcesQueryOptions,
  type ApplicationMemberItem,
  type ApplicationVisibility,
  type UpdateApplicationBody,
  useApplicationMembersQuery,
  useApplicationQuery,
  useClientQuery,
  useClientsQuery,
  useDeleteApplicationMutation,
  useRemoveApplicationMemberMutation,
  useResourcesQuery,
  useRootDomain,
  useUpdateApplicationMutation,
} from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';

import styles from '@/features/console/console.module.css';

type Tab = 'overview' | 'credentials' | 'api' | 'roles' | 'members' | 'organisations';

interface VisibilityMeta {
  label: string;
  description: string;
  intent: ChipIntent;
}

/** An application owns exactly one provisioned OAuth client and one `api://<app>` resource; the console administers them through the application. */
export const Route = createFileRoute('/console/applications/$appId')({
  /** The open tab lives in the URL (`?tab=`) so it survives refresh and is deep-linkable; absent means overview. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const tab = search.tab;
    return { tab: tab === 'credentials' || tab === 'api' || tab === 'roles' || tab === 'members' || tab === 'organisations' ? tab : undefined };
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

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'api', label: 'API & scopes' },
  { key: 'roles', label: 'Roles' },
  { key: 'members', label: 'Members' },
  { key: 'organisations', label: 'Organisations' },
];

/** PUBLIC to everyone, RESTRICTED only to organisations a platform admin releases it to, INTERNAL to platform staff alone. */
const VISIBILITY: Record<ApplicationVisibility, VisibilityMeta> = {
  PUBLIC: { label: 'Public', description: 'Generally available — every organisation and personal workspace can use it.', intent: 'success' },
  RESTRICTED: { label: 'Restricted', description: 'Only organisations you release it to can use it. Manage releases in the Organisations tab.', intent: 'warning' },
  INTERNAL: { label: 'Internal', description: 'Platform staff only. It is hidden from everyone else — refused as an unknown application.', intent: 'info' },
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
  const rootDomain = useRootDomain();
  const { require, dialog } = useStepUpGate();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<UpdateApplicationBody>({});
  const [memberSearch, setMemberSearch] = useState('');
  const [membersPage, setMembersPage] = useState(1);

  const data = app.data;
  /** Resolved by ownership rather than id, so the page never needs the derived client-id/audience convention. */
  const clientSummary = useMemo(() => (clientsQuery.data?.items ?? []).find(client => client.applicationId === data?.id), [clientsQuery.data, data?.id]);
  const clientDetail = useClientQuery(clientSummary?.id ?? '', Boolean(clientSummary));
  const resource = useMemo(() => (resourcesQuery.data?.items ?? []).find(item => item.applicationId === data?.id), [resourcesQuery.data, data?.id]);
  const allMembers = useMemo(() => members.data?.items ?? [], [members.data]);
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
    credentials: undefined,
    api: resource?.scopes.length,
    roles: data.roles.length,
    members: allMembers.length,
    organisations: undefined,
  };
  /** The Organisations tab only makes sense for a RESTRICTED app — a PUBLIC/INTERNAL app has no per-org releases. */
  const visibleTabs = TABS.filter(item => item.key !== 'organisations' || data.visibility === 'RESTRICTED');
  const visibility = VISIBILITY[data.visibility];
  const homeLabel = data.homePageUrl ? data.homePageUrl.replace(/^https?:\/\//, '') : `${data.subDomain}.${rootDomain}`;
  const homeUrl = data.homePageUrl || `https://${data.subDomain}.${rootDomain}`;

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

  const changeVisibility = (value: string): void => {
    const next = value as ApplicationVisibility;
    if (next === data.visibility) return;
    require(() =>
      update.mutate(
        { appId, body: { visibility: next } },
        { onSuccess: () => toast.success(`Visibility set to ${VISIBILITY[next].label}`), onError: error => toast.danger(error.message) },
      ),
    );
  };

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
            <StatusChip intent={visibility.intent}>{visibility.label}</StatusChip>
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
        {visibleTabs.map(item => (
          <button
            key={item.key}
            className={styles.appTab}
            data-active={tab === item.key || undefined}
            onClick={() => navigate({ search: prev => ({ ...prev, tab: item.key === 'overview' ? undefined : item.key }), replace: true })}
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

          <Alert intent="info" title="One application, one identity">
            Creating an application provisions its OAuth client and its <code>api://{data.name}</code> resource automatically. Manage the credential and API surface from the
            Credentials and API &amp; scopes tabs — there are no separate client or resource objects to register.
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
                <Statistic label="Scopes" value={resource?.scopes.length ?? 0} size="sm" />
                <Statistic label="Roles" value={data.roles.length} size="sm" />
              </div>
            </div>
          </div>

          <div className={styles.detailCard}>
            <div className={styles.tabHead}>
              <div className={styles.tabHeadMain}>
                <h2 id="app-visibility-heading" className={styles.tabTitle}>
                  Visibility
                </h2>
                <p className={styles.tabDesc}>{visibility.description}</p>
              </div>
              <div style={{ minWidth: 200 }}>
                <Select aria-labelledby="app-visibility-heading" value={data.visibility} onValueChange={changeVisibility}>
                  <Select.Item value="PUBLIC" description={VISIBILITY.PUBLIC.description}>
                    {VISIBILITY.PUBLIC.label}
                  </Select.Item>
                  <Select.Item value="RESTRICTED" description={VISIBILITY.RESTRICTED.description}>
                    {VISIBILITY.RESTRICTED.label}
                  </Select.Item>
                  <Select.Item value="INTERNAL" description={VISIBILITY.INTERNAL.description}>
                    {VISIBILITY.INTERNAL.label}
                  </Select.Item>
                </Select>
              </div>
            </div>
            {data.visibility === 'RESTRICTED' && (
              <Button variant="secondary" size="sm" onClick={() => navigate({ search: prev => ({ ...prev, tab: 'organisations' }), replace: true })}>
                Manage organisations
              </Button>
            )}
          </div>
        </div>
      )}

      {tab === 'organisations' && <OrganisationsTab appId={appId} require={require} />}

      {tab === 'credentials' && (
        <CredentialsTab appId={appId} appName={data.name} publicUrls={data.publicUrls} client={clientDetail.data} loading={clientDetail.isLoading} require={require} />
      )}

      {tab === 'api' && <ApiScopesTab appName={data.name} resource={resource} resources={resourcesQuery.data?.items ?? []} client={clientDetail.data} require={require} />}

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
            <p className={styles.tabDesc}>People enrolled by first authorising this application. Identified by primary email, or username where no email is on file.</p>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <Input
                size="sm"
                placeholder="Search members by email or username…"
                aria-label="Search members by email or username"
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
              emptyState={<EmptyState size="inline" title="No members yet" description="When someone first authorises this application, they’ll be enrolled here automatically." />}
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
                <Input suffix={`.${rootDomain}`} value={form.subDomain ?? ''} onValueChange={value => setForm(prev => ({ ...prev, subDomain: value }))} />
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
        description="This removes the application together with its provisioned client and API resource. This cannot be undone."
        confirmLabel="Delete application"
        typedConfirmation={data.name}
        onConfirm={() =>
          require(() =>
            del.mutateAsync(appId, {
              onSuccess: () => {
                toast.success('Application deleted');
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
