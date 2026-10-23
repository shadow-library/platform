import { useMemo, useState } from 'react';
import { Button, Select, Tag, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/si';
import { type ClientDetailResponse, type ResourceItem, useCreateScopeMutation, useGrantClientScopeMutation, useRevokeClientScopeMutation } from '@/lib/apis';
import { AddScopeDialog } from './add-scope-dialog';
import { type Require } from './application-detail.types';
import styles from '@/features/console/console.module.css';

export function ApiScopesTab(props: { appName: string; resource?: ResourceItem; resources: ResourceItem[]; client?: ClientDetailResponse; require: Require }): React.JSX.Element {
  const { appName, resource, resources, client, require } = props;
  const createScope = useCreateScopeMutation();
  const grant = useGrantClientScopeMutation();
  const revoke = useRevokeClientScopeMutation();
  const [addScopeOpen, setAddScopeOpen] = useState(false);
  const [grantScopeId, setGrantScopeId] = useState('');

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
            <Select placeholder="Grant a scope…" aria-label="Grant a scope" value={grantScopeId} onValueChange={grantScope}>
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
