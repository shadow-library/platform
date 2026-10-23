import { useState } from 'react';
import { Alert, Button, DescriptionList, Dialog, FormField, Input, Spinner, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

import { SecretDialog } from '@/features/console';
import { type ClientDetailResponse, type UpdateClientBody, useRotateClientSecretMutation, useUpdateApplicationMutation, useUpdateClientMutation } from '@/lib/apis';
import { formatDate } from '@/lib/format';
import { isValidWorkloadBinding } from '@/lib/workload-binding';
import { type Require } from './application-detail.types';
import styles from '@/features/console/console.module.css';

const AUTH_METHOD_LABEL: Record<string, string> = {
  none: 'PKCE (no secret)',
  client_secret: 'Client secret',
  workload_identity: 'Workload identity (Kubernetes)',
};

/**
 * The application's single OAuth client, presented as its credential surface. Redirect URIs are derived
 * from the application's public URLs (editing the origins rewrites them server-side), so they are shown
 * read-only; the secret, back-channel logout URI, and any workload-identity subjects are edited here.
 */
export function CredentialsTab(props: {
  appId: string;
  appName: string;
  publicUrls: string[];
  client?: ClientDetailResponse;
  loading: boolean;
  require: Require;
}): React.JSX.Element {
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
    /** Public URLs live on the application (their redirect URIs derive from them); the rest live on the client. */
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
                    validate={value => isValidWorkloadBinding(value) || 'Must be system:serviceaccount:namespace:name (name may be *)'}
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
