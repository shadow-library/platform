/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  FormField,
  Input,
  Select,
  Spinner,
  Tag,
  toast,
  TokenInput,
  type TokenValue,
} from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ArrowLeftIcon } from '@/components/icons';
import { StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import { useStepUpGate } from '@/features/portal';
import {
  adminApplicationsQueryOptions,
  adminClientQueryOptions,
  adminResourcesQueryOptions,
  type ClientKind,
  type UpdateClientBody,
  useApplicationsQuery,
  useClientQuery,
  useDeleteClientMutation,
  useGrantClientScopeMutation,
  useResourcesQuery,
  useRevokeClientScopeMutation,
  useRotateClientSecretMutation,
  useUpdateClientMutation,
} from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from './console.module.css';

/**
 * Defining types
 */
type ClientAuthMethod = 'none' | 'client_secret' | 'workload_identity';

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/console/clients/$clientId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminClientQueryOptions(params.clientId)),
      context.queryClient.ensureQueryData(adminResourcesQueryOptions()),
      context.queryClient.ensureQueryData(adminApplicationsQueryOptions()),
    ]),
  component: ClientDetailPage,
});

const CLIENT_KIND: Record<ClientKind, { label: string; intent: 'info' | 'neutral' }> = {
  WEB_CONFIDENTIAL: { label: 'Server', intent: 'neutral' },
  SPA_PUBLIC: { label: 'Browser', intent: 'info' },
  NATIVE_PUBLIC: { label: 'Native', intent: 'info' },
  SERVICE: { label: 'Service', intent: 'neutral' },
};

const AUTH_METHOD_LABEL: Record<ClientAuthMethod, string> = {
  none: 'PKCE (no secret)',
  client_secret: 'Client secret',
  workload_identity: 'Workload identity (Kubernetes)',
};

function ClientDetailPage(): React.JSX.Element {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const client = useClientQuery(clientId);
  const resourcesQuery = useResourcesQuery();
  const appsQuery = useApplicationsQuery();
  const update = useUpdateClientMutation();
  const rotate = useRotateClientSecretMutation();
  const grant = useGrantClientScopeMutation();
  const revoke = useRevokeClientScopeMutation();
  const del = useDeleteClientMutation();
  const { require, dialog } = useStepUpGate();

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [form, setForm] = useState<UpdateClientBody>({});
  const [redirectTokens, setRedirectTokens] = useState<TokenValue[]>([]);
  const [grantScopeId, setGrantScopeId] = useState('');

  const data = client.data;

  /** Every resource scope, tagged with its owning resource — used to grant, and to map a granted name back to its id for revoke. */
  const allScopes = useMemo(
    () => (resourcesQuery.data?.items ?? []).flatMap(resource => resource.scopes.map(scope => ({ ...scope, resource: resource.displayName ?? resource.identifier }))),
    [resourcesQuery.data],
  );
  /** The detail endpoint returns granted scopes by name, but grant/revoke take a scope id — so we resolve names locally. */
  const scopeIdByName = useMemo(() => new Map(allScopes.map(scope => [scope.name, scope.id] as const)), [allScopes]);

  if (client.isLoading || !data)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spinner size="lg" label="Loading client" />
      </div>
    );

  const kind = CLIENT_KIND[data.kind];
  const isPublic = data.authMethod === 'none';
  const hasSecret = data.authMethod === 'client_secret';
  const isWorkload = data.authMethod === 'workload_identity';
  const usesRedirects = data.kind !== 'SERVICE';
  const app = (appsQuery.data?.items ?? []).find(item => item.id === data.applicationId);
  const appName = app ? (app.displayName ?? app.name) : `Application ${data.applicationId}`;
  const grantedNames = data.scopes;
  const grantedSet = new Set(grantedNames);
  const availableScopes = allScopes.filter(scope => !grantedSet.has(scope.name));

  const rotateSecret = (): void => require(() => rotate.mutate(clientId, { onSuccess: result => setSecret(result.secret), onError: error => toast.danger(error.message) }));

  const openEdit = (): void =>
    require(() => {
      setForm({ name: data.name, backchannelLogoutUri: data.backchannelLogoutUri ?? '', ...(isWorkload ? { workloadSubject: data.workloadSubject ?? '' } : {}) });
      setRedirectTokens(data.redirectUris.map(uri => ({ value: uri, valid: true })));
      setEditOpen(true);
    });

  const saveEdit = (): void => {
    const body: UpdateClientBody = { name: form.name?.trim() || data.name };
    if (usesRedirects) {
      body.redirectUris = redirectTokens.filter(token => token.valid).map(token => token.value);
      /** An empty value clears the back-channel logout URI; the server treats '' as an explicit clear. */
      body.backchannelLogoutUri = (form.backchannelLogoutUri ?? '').trim();
    }
    /** An empty subject unbinds the workload identity; the server treats '' as an explicit clear. */
    if (isWorkload) body.workloadSubject = (form.workloadSubject ?? '').trim();
    update.mutate(
      { clientId, body },
      {
        onSuccess: () => {
          toast.success('Client updated');
          setEditOpen(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  const setActive = (next: boolean): void =>
    require(() =>
      update.mutate(
        { clientId, body: { isActive: next } },
        {
          onSuccess: () => {
            toast.success(next ? 'Client activated' : 'Client deactivated');
            setDeactivateOpen(false);
          },
          onError: error => toast.danger(error.message),
        },
      ),
    );

  const removeClient = (): void =>
    require(() =>
      del.mutate(clientId, {
        onSuccess: () => {
          toast.success('Client deleted');
          setDeleteOpen(false);
          navigate({ to: '/console/clients' });
        },
        onError: error => toast.danger(error.message),
      }),
    );

  const grantScope = (scopeId: string): void => {
    setGrantScopeId(scopeId);
    require(() =>
      grant.mutate(
        { clientId, scopeId },
        {
          onSuccess: () => {
            toast.success('Scope granted');
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
    const scopeId = scopeIdByName.get(name);
    if (!scopeId) {
      toast.danger('This scope can’t be revoked here.');
      return;
    }
    require(() => revoke.mutate({ clientId, scopeId }, { onSuccess: () => toast.success('Scope revoked'), onError: error => toast.danger(error.message) }));
  };

  return (
    <div className={styles.clientDetailPage}>
      <button className={styles.backLink} onClick={() => navigate({ to: '/console/clients' })}>
        <ArrowLeftIcon size={15} />
        Back to clients
      </button>

      <div className={styles.detailHead}>
        <Avatar name={data.name} shape="square" size="xl" />
        <div className={styles.detailHeadMain}>
          <div className={styles.detailEyebrow}>OAuth client</div>
          <div className={styles.detailName}>
            {data.name}
            <StatusChip intent={data.isActive ? 'success' : 'neutral'} dot>
              {data.isActive ? 'Active' : 'Inactive'}
            </StatusChip>
            <Badge intent={kind.intent}>{kind.label}</Badge>
            {data.isFirstParty && <StatusChip intent="accent">First-party</StatusChip>}
          </div>
          <div className={styles.detailSub}>
            {isPublic ? 'Public' : 'Confidential'} client · belongs to {appName}
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        {hasSecret && (
          <Button variant="secondary" size="sm" loading={rotate.isPending} onClick={rotateSecret}>
            Rotate secret
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={openEdit}>
          Edit client
        </Button>
        <div className={styles.spacer} />
        {data.isActive ? (
          <Button variant="danger" size="sm" onClick={() => setDeactivateOpen(true)}>
            Deactivate client…
          </Button>
        ) : (
          <Button variant="secondary" size="sm" loading={update.isPending} onClick={() => setActive(true)}>
            Activate client
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          Delete client…
        </Button>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <DescriptionList layout="row" termWidth={140} title="Client">
            <DescriptionList.Item term="Client ID" mono copyable>
              {data.id}
            </DescriptionList.Item>
            <DescriptionList.Item term="Type">
              {kind.label} ({isPublic ? 'public' : 'confidential'})
            </DescriptionList.Item>
            <DescriptionList.Item term="Auth method">{AUTH_METHOD_LABEL[data.authMethod]}</DescriptionList.Item>
            <DescriptionList.Item term="Application">{appName}</DescriptionList.Item>
            <DescriptionList.Item term="Grant types">{data.grantTypes.join(', ') || '—'}</DescriptionList.Item>
            <DescriptionList.Item term="Created">{formatDate(data.createdAt)}</DescriptionList.Item>
            {isWorkload && data.workloadSubject && (
              <DescriptionList.Item term="Workload subject" mono>
                {data.workloadSubject}
              </DescriptionList.Item>
            )}
          </DescriptionList>
        </div>

        <div className={`${styles.detailCard} ${styles.cardStack}`}>
          <div>
            <div className={styles.cardSectionTitle}>Redirect URIs</div>
            {data.redirectUris.length === 0 ? (
              <div className={styles.emptyScopes}>{usesRedirects ? 'No redirect URIs configured.' : 'Not applicable for service clients.'}</div>
            ) : (
              <div className={styles.uriList}>
                {data.redirectUris.map(uri => (
                  <div key={uri} className={styles.uriItem} title={uri}>
                    {uri}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className={styles.cardSectionTitle}>Allowed scopes</div>
            {grantedNames.length === 0 ? (
              <div className={styles.emptyScopes}>No scopes granted yet.</div>
            ) : (
              <div className={styles.scopeRow}>
                {grantedNames.map(name => (
                  <Tag key={name} onRemove={() => revokeScope(name)}>
                    {name}
                  </Tag>
                ))}
              </div>
            )}
            {availableScopes.length > 0 && (
              <div className={styles.scopeGrant} style={{ marginTop: 12 }}>
                <Select placeholder="Grant a scope…" value={grantScopeId} onValueChange={grantScope}>
                  {availableScopes.map(scope => (
                    <Select.Item key={scope.id} value={scope.id}>
                      {scope.name} · {scope.resource}
                    </Select.Item>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>

      <Alert intent="info" title="Public vs confidential clients">
        Confidential (server) clients authenticate with a <b>client secret</b>. Public (browser / mobile) clients use <b>PKCE with no secret</b>. Certificate and JWT-assertion
        methods aren’t supported.
      </Alert>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <Dialog.Content size="md">
          <Dialog.Header title="Edit client" />
          <Dialog.Body>
            <div className={styles.form}>
              <FormField label="Client name" required>
                <Input value={form.name ?? ''} onValueChange={value => setForm(prev => ({ ...prev, name: value }))} />
              </FormField>
              {usesRedirects && (
                <FormField label="Redirect URIs" helper="Where the server may return the authorization code.">
                  <TokenInput
                    value={redirectTokens}
                    onValueChange={setRedirectTokens}
                    placeholder="https://app.example.com/callback"
                    validate={value => /^https?:\/\//.test(value) || 'Must be a URL'}
                  />
                </FormField>
              )}
              {usesRedirects && (
                <FormField label="Back-channel logout URI" helper="Optional OIDC endpoint that receives logout tokens. Clear it to disable.">
                  <Input
                    value={form.backchannelLogoutUri ?? ''}
                    onValueChange={value => setForm(prev => ({ ...prev, backchannelLogoutUri: value }))}
                    placeholder="https://app.example.com/oidc/backchannel-logout"
                  />
                </FormField>
              )}
              {isWorkload && (
                <FormField label="Workload subject" helper="The bound Kubernetes service account. Clear it to unbind.">
                  <Input value={form.workloadSubject ?? ''} onValueChange={value => setForm(prev => ({ ...prev, workloadSubject: value }))} />
                </FormField>
              )}
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
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        intent="danger"
        title={`Deactivate ${data.name}?`}
        description="The client can no longer request tokens until it is reactivated. Existing tokens are unaffected."
        confirmLabel="Deactivate client"
        loading={update.isPending}
        onConfirm={() => setActive(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        intent="danger"
        title={`Delete ${data.name}?`}
        description="This permanently removes the client and its secrets, redirect URIs, scope grants, and stored consents. Anything authenticating as this client will stop working. Already-issued access tokens remain valid until they expire. This cannot be undone."
        confirmLabel="Delete client"
        typedConfirmation={data.name}
        loading={del.isPending}
        onConfirm={removeClient}
      />

      <SecretDialog
        open={secret !== null}
        onOpenChange={open => !open && setSecret(null)}
        title="Client secret"
        description="This is the only time the new secret is shown. Store it securely — the previous secret keeps working briefly during rollover."
        secret={secret ?? undefined}
        downloadName="client-secret.txt"
      />
      {dialog}
    </div>
  );
}
