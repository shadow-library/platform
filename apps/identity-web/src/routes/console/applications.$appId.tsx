/**
 * Importing npm packages
 */
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
  Tag,
  Textarea,
  toast,
  TokenInput,
  type TokenValue,
} from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ArrowLeftIcon, ExternalLinkIcon } from '@/components/icons';
import { StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import { useStepUpGate } from '@/features/portal';
import {
  adminApplicationMembersQueryOptions,
  adminApplicationQueryOptions,
  adminClientsQueryOptions,
  adminResourcesQueryOptions,
  type ApplicationMemberItem,
  type ClientDetailResponse,
  type ResourceItem,
  type UpdateApplicationBody,
  type UpdateClientBody,
  useApplicationMembersQuery,
  useApplicationQuery,
  useClientQuery,
  useClientsQuery,
  useCreateScopeMutation,
  useDeleteApplicationMutation,
  useGrantClientScopeMutation,
  useRemoveApplicationMemberMutation,
  useResourcesQuery,
  useRevokeClientScopeMutation,
  useRootDomain,
  useRotateClientSecretMutation,
  useUpdateApplicationMutation,
  useUpdateClientMutation,
} from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';

import styles from './console.module.css';

/**
 * Defining types
 */
type Tab = 'overview' | 'credentials' | 'api' | 'roles' | 'members';

type Require = (action: () => void) => void;

/**
 * Declaring the constants
 *
 * The application is the unit of identity (D-21): it is provisioned with exactly one OAuth client and
 * one `api://<app>` resource, so the console administers those *through* the application rather than as
 * standalone objects. The credentials tab manages the client (secret, public URLs, workload subjects);
 * the API tab manages the resource's scopes and this application's grants on other applications (D-22).
 */
export const Route = createFileRoute('/console/applications/$appId')({
  /** The open tab lives in the URL (`?tab=`) so it survives refresh and is deep-linkable; absent means overview. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const tab = search.tab;
    return { tab: tab === 'credentials' || tab === 'api' || tab === 'roles' || tab === 'members' ? tab : undefined };
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
];

const AUTH_METHOD_LABEL: Record<string, string> = {
  none: 'PKCE (no secret)',
  client_secret: 'Client secret',
  workload_identity: 'Workload identity (Kubernetes)',
};

const MEMBERS_PAGE_SIZE = 25;

/** An exact SA subject `system:serviceaccount:<ns>:<name>` or a namespace-scoped pattern `…:<ns>:*`. */
const WORKLOAD_BINDING_PATTERN = /^system:serviceaccount:[a-z0-9]([-a-z0-9]*[a-z0-9])?:[a-z0-9*]([-a-z0-9*]*[a-z0-9*])?$/;

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
  // Under D-21 an application owns exactly one provisioned client and one resource; we resolve them by
  // ownership rather than by id so the page never has to know the derived client-id/audience convention.
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
  };
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
        </div>
      )}

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

/**
 * The application's single OAuth client, presented as its credential surface. Redirect URIs are derived
 * from the application's public URLs (editing the origins rewrites them server-side), so they are shown
 * read-only; the secret, back-channel logout URI, and any workload-identity subjects are edited here.
 */
function CredentialsTab(props: { appId: string; appName: string; publicUrls: string[]; client?: ClientDetailResponse; loading: boolean; require: Require }): React.JSX.Element {
  const { appId, appName, publicUrls, client, loading, require } = props;
  const updateApp = useUpdateApplicationMutation();
  const updateClient = useUpdateClientMutation();
  const rotate = useRotateClientSecretMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [origins, setOrigins] = useState<TokenValue[]>([]);
  const [workloadTokens, setWorkloadTokens] = useState<TokenValue[]>([]);
  const [backchannel, setBackchannel] = useState('');

  if (loading || !client)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner size="md" label="Loading credentials" />
      </div>
    );

  const isWorkload = client.authMethod === 'workload_identity';
  const hasSecret = client.authMethod === 'client_secret';

  const openEdit = (): void =>
    require(() => {
      setOrigins(publicUrls.map(url => ({ value: url, valid: true })));
      setWorkloadTokens((client.workloadSubjects ?? []).map(subject => ({ value: subject, valid: true })));
      setBackchannel(client.backchannelLogoutUri ?? '');
      setEditOpen(true);
    });

  const save = (): void => {
    const nextOrigins = origins.filter(token => token.valid).map(token => token.value);
    const clientBody: UpdateClientBody = { backchannelLogoutUri: backchannel.trim() };
    if (isWorkload) clientBody.workloadSubjects = workloadTokens.filter(token => token.valid).map(token => token.value);
    // Public URLs live on the application (their redirect URIs derive from them); the rest live on the client.
    updateApp.mutate(
      { appId, body: { publicUrls: nextOrigins } },
      {
        onError: error => toast.danger(error.message),
        onSuccess: () =>
          updateClient.mutate(
            { clientId: client.id, body: clientBody },
            {
              onSuccess: () => {
                toast.success('Credentials updated');
                setEditOpen(false);
              },
              onError: error => toast.danger(error.message),
            },
          ),
      },
    );
  };

  const rotateSecret = (): void => require(() => rotate.mutate(client.id, { onSuccess: result => setSecret(result.secret), onError: error => toast.danger(error.message) }));

  return (
    <div className={styles.clientDetailPage}>
      <div className={styles.actionBar}>
        {hasSecret && (
          <Button variant="secondary" size="sm" loading={rotate.isPending} onClick={rotateSecret}>
            Rotate secret
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={openEdit}>
          Edit credentials
        </Button>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <DescriptionList layout="row" termWidth={140} title="OAuth client">
            <DescriptionList.Item term="Client ID" mono copyable>
              {client.id}
            </DescriptionList.Item>
            <DescriptionList.Item term="Audience" mono>
              api://{appName}
            </DescriptionList.Item>
            <DescriptionList.Item term="Auth method">{AUTH_METHOD_LABEL[client.authMethod] ?? client.authMethod}</DescriptionList.Item>
            <DescriptionList.Item term="Grant types">{client.grantTypes.join(', ') || '—'}</DescriptionList.Item>
            <DescriptionList.Item term="Created">{formatDate(client.createdAt)}</DescriptionList.Item>
            {isWorkload && (client.workloadSubjects?.length ?? 0) > 0 && (
              <DescriptionList.Item term="Workload subjects" mono>
                {(client.workloadSubjects ?? []).join('\n')}
              </DescriptionList.Item>
            )}
          </DescriptionList>
        </div>

        <div className={`${styles.detailCard} ${styles.cardStack}`}>
          <div>
            <div className={styles.cardSectionTitle}>Public URLs</div>
            {publicUrls.length === 0 ? (
              <div className={styles.emptyScopes}>No public URLs configured.</div>
            ) : (
              <div className={styles.uriList}>
                {publicUrls.map(url => (
                  <div key={url} className={styles.uriItem} title={url}>
                    {url}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className={styles.cardSectionTitle}>Redirect URIs (derived)</div>
            {client.redirectUris.length === 0 ? (
              <div className={styles.emptyScopes}>Set a public URL to derive a callback redirect URI.</div>
            ) : (
              <div className={styles.uriList}>
                {client.redirectUris.map(uri => (
                  <div key={uri} className={styles.uriItem} title={uri}>
                    {uri}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className={styles.cardSectionTitle}>Back-channel logout URI</div>
            <div className={styles.uriItem} title={client.backchannelLogoutUri ?? ''}>
              {client.backchannelLogoutUri || '— not configured'}
            </div>
          </div>
        </div>
      </div>

      <Alert intent="info" title="Redirect URIs follow your public URLs">
        A confidential client’s callback redirect URIs are derived from the application’s public origins. Edit the public URLs to change where the authorization code may be
        returned.
      </Alert>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <Dialog.Content size="md">
          <Dialog.Header title="Edit credentials" />
          <Dialog.Body>
            <div className={styles.form}>
              <FormField label="Public URLs" helper="Browser origins for this application; each derives an /api/auth/callback redirect URI.">
                <TokenInput value={origins} onValueChange={setOrigins} placeholder="https://app.example.com" validate={value => /^https?:\/\//.test(value) || 'Must be a URL'} />
              </FormField>
              <FormField label="Back-channel logout URI" helper="Optional OIDC endpoint that receives logout tokens. Clear it to disable.">
                <Input value={backchannel} onValueChange={setBackchannel} placeholder="https://app.example.com/oidc/backchannel-logout" />
              </FormField>
              {isWorkload && (
                <FormField
                  label="Workload subjects"
                  helper="Kubernetes service accounts allowed to authenticate. Use a namespace pattern like system:serviceaccount:novel-forge:* to cover many. Remove all to unbind."
                >
                  <TokenInput
                    value={workloadTokens}
                    onValueChange={setWorkloadTokens}
                    placeholder="system:serviceaccount:novel-forge:novel-forge-server"
                    validate={value => WORKLOAD_BINDING_PATTERN.test(value) || 'Must be system:serviceaccount:namespace:name (name may be *)'}
                  />
                </FormField>
              )}
            </div>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" loading={updateApp.isPending || updateClient.isPending} onClick={save}>
              Save changes
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <SecretDialog
        open={secret !== null}
        onOpenChange={open => !open && setSecret(null)}
        title="Client secret"
        description="This is the only time the new secret is shown. Store it securely — the previous secret keeps working briefly during rollover."
        secret={secret ?? undefined}
        downloadName="client-secret.txt"
      />
    </div>
  );
}

/**
 * The application's `api://<app>` resource: the scopes its own API defines (each optionally sensitive),
 * and — separately — the scopes an admin has granted this application on *other* applications' APIs,
 * which are the ceiling for its delegated calls (D-22).
 */
function ApiScopesTab(props: { appName: string; resource?: ResourceItem; resources: ResourceItem[]; client?: ClientDetailResponse; require: Require }): React.JSX.Element {
  const { appName, resource, resources, client, require } = props;
  const createScope = useCreateScopeMutation();
  const grant = useGrantClientScopeMutation();
  const revoke = useRevokeClientScopeMutation();
  const [addScopeOpen, setAddScopeOpen] = useState(false);
  const [grantScopeId, setGrantScopeId] = useState('');

  // Every scope on another application's resource, tagged with its owning API — the pool this application may be granted.
  const foreignScopes = useMemo(
    () => resources.filter(item => item.id !== resource?.id).flatMap(item => item.scopes.map(scope => ({ ...scope, resource: item.displayName ?? item.identifier }))),
    [resources, resource?.id],
  );
  const scopeIdByName = useMemo(() => new Map(foreignScopes.map(scope => [scope.name, scope.id] as const)), [foreignScopes]);
  const ownNames = useMemo(() => new Set(resource?.scopes.map(scope => scope.name) ?? []), [resource]);
  const grantedNames = (client?.scopes ?? []).filter(name => !ownNames.has(name));
  const grantedSet = new Set(grantedNames);
  const grantable = foreignScopes.filter(scope => !grantedSet.has(scope.name));

  const grantScope = (scopeId: string): void => {
    if (!client) return;
    setGrantScopeId(scopeId);
    require(() =>
      grant.mutate(
        { clientId: client.id, scopeId },
        {
          onSuccess: () => {
            toast.success('Grant added');
            setGrantScopeId('');
          },
          onError: error => {
            toast.danger(error.message);
            setGrantScopeId('');
          },
        },
      ),
    );
  };

  const revokeScope = (name: string): void => {
    if (!client) return;
    const scopeId = scopeIdByName.get(name);
    if (!scopeId) {
      toast.danger('This grant can’t be revoked here.');
      return;
    }
    require(() => revoke.mutate({ clientId: client.id, scopeId }, { onSuccess: () => toast.success('Grant revoked'), onError: error => toast.danger(error.message) }));
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>API &amp; scopes</h2>
          <p className={styles.tabDesc}>
            The <code>api://{appName}</code> resource this application issues tokens for, the scopes it defines, and the scopes it is granted on other applications.
          </p>
        </div>
        {resource && (
          <Button variant="secondary" size="sm" onClick={() => require(() => setAddScopeOpen(true))}>
            Add scope
          </Button>
        )}
      </div>

      <div className={styles.resourceCard}>
        <div className={styles.resourceHead}>
          <div>
            <div className={styles.resourceName}>{resource?.displayName ?? `api://${appName}`}</div>
            <div className={styles.mono} style={{ marginTop: 2 }}>
              {resource?.identifier ?? `api://${appName}`}
            </div>
          </div>
        </div>
        {resource && resource.scopes.length > 0 ? (
          <div className={styles.scopeRow}>
            {resource.scopes.map(scope => (
              <span key={scope.id} className={styles.scopeTag}>
                <Tag>{scope.name}</Tag>
                {scope.principalType !== 'BOTH' && <StatusChip intent="neutral">{scope.principalType === 'SERVICE' ? 'M2M' : 'user'}</StatusChip>}
                {scope.isSensitive && <StatusChip intent="warning">sensitive</StatusChip>}
              </span>
            ))}
          </div>
        ) : (
          <div className={styles.emptyScopes}>No scopes defined yet.</div>
        )}
      </div>

      <div className={styles.resourceCard}>
        <div className={styles.cardSectionTitle}>Grants on other applications</div>
        {grantedNames.length === 0 ? (
          <div className={styles.emptyScopes}>No cross-application grants.</div>
        ) : (
          <div className={styles.scopeRow}>
            {grantedNames.map(name => (
              <Tag key={name} onRemove={() => revokeScope(name)}>
                {name}
              </Tag>
            ))}
          </div>
        )}
        {client && grantable.length > 0 && (
          <div className={styles.scopeGrant} style={{ marginTop: 12 }}>
            <Select placeholder="Grant a scope…" value={grantScopeId} onValueChange={grantScope}>
              {grantable.map(scope => (
                <Select.Item key={scope.id} value={scope.id}>
                  {scope.name} · {scope.resource}
                </Select.Item>
              ))}
            </Select>
          </div>
        )}
      </div>

      {resource && <AddScopeDialog resourceId={resource.id} open={addScopeOpen} onOpenChange={setAddScopeOpen} createScope={createScope} />}
    </div>
  );
}

function AddScopeDialog(props: {
  resourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createScope: ReturnType<typeof useCreateScopeMutation>;
}): React.JSX.Element {
  const { resourceId, open, onOpenChange, createScope } = props;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [principalType, setPrincipalType] = useState<'USER' | 'SERVICE' | 'BOTH'>('BOTH');

  const submit = (): void => {
    if (!name.trim()) return;
    createScope.mutate(
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
        <Dialog.Header title="Add scope" description="Sensitive scopes mint only into a stepped-up (AAL2) token and stand out on the consent screen." />
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
            <Switch
              label="Sensitive"
              description="Requires step-up (AAL2) and is highlighted on the consent screen."
              checked={sensitive}
              onCheckedChange={value => setSensitive(value === true)}
            />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={createScope.isPending} onClick={submit}>
            Add scope
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
