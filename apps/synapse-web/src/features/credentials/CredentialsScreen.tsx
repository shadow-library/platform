import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Table, type TableColumn, Tag, useConfirm } from '@shadow-library/ui';

import { Mono, Muted, type Notice, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { credentialKeys, type CredentialResponse, credentialsQueryOptions, revokeCredential, testCredential, useCapabilities } from '@/lib';

import { CreateCredentialDialog, RotateCredentialDialog } from './CredentialDialogs';
import { credentialErrorMessage, describeTest, hintLabel, inUseMessage, isRevoked, revokeDescription, rotatedLabel, sortCredentials, type TestReport } from './credential-view';
import styles from './Credentials.module.css';

type DialogState = { kind: 'create' } | { kind: 'rotate'; credential: CredentialResponse } | null;

type ScreenNotice = Notice & { catalogLink?: boolean };

type RowTest = { status: 'running' } | ({ status: 'done' } & TestReport);

export function CredentialsScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.manageCredentials} area="provider credentials">
      <CredentialsView />
    </PermissionGate>
  );
}

function TestResult({ test }: { test?: RowTest }): ReactElement | null {
  if (!test) return null;
  if (test.status === 'running') return <span className={styles.testRunning}>Testing…</span>;
  return <span className={test.ok ? styles.testOk : styles.testFailed}>{test.message}</span>;
}

function CredentialsView(): ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const credentials = useQuery(credentialsQueryOptions());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [tests, setTests] = useState<Record<string, RowTest>>({});
  const [revoking, setRevoking] = useState<readonly string[]>([]);

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: credentialKeys.all });

  const forgetTest = (id: string): void => setTests(({ [id]: _forgotten, ...rest }) => rest);

  const handleCreated = (credential: CredentialResponse): void => {
    setDialog(null);
    setNotice({ intent: 'success', title: `Created "${credential.name}"`, body: 'Point a provider at it in the catalog editor, then publish the catalog.' });
    void refresh();
  };

  const handleRotated = (credential: CredentialResponse): void => {
    setDialog(null);
    forgetTest(credential.id);
    setNotice({
      intent: 'success',
      title: `Rotated "${credential.name}"`,
      body: `It is now version ${credential.version}, key ${hintLabel(credential.hint)}. Run a test to check the new key.`,
    });
    void refresh();
  };

  const handleTest = async (credential: CredentialResponse): Promise<void> => {
    if (tests[credential.id]?.status === 'running') return;
    setTests(current => ({ ...current, [credential.id]: { status: 'running' } }));
    const report = await testCredential(credential.id).then(describeTest, (error: unknown) => ({ ok: false, message: credentialErrorMessage(error) }));
    setTests(current => ({ ...current, [credential.id]: { status: 'done', ...report } }));
  };

  const handleRevoke = async (credential: CredentialResponse): Promise<void> => {
    if (revoking.includes(credential.id)) return;
    const confirmed = await confirm({ title: `Revoke "${credential.name}"?`, description: revokeDescription(credential), confirmLabel: 'Revoke', intent: 'danger' });
    if (!confirmed) return;
    setNotice(null);
    setRevoking(current => [...current, credential.id]);
    try {
      const outcome = await revokeCredential(credential.id);
      if (outcome.kind === 'in_use') setNotice({ intent: 'danger', title: `"${credential.name}" is still in use`, body: inUseMessage(outcome.referencedBy), catalogLink: true });
      else {
        forgetTest(credential.id);
        setNotice({ intent: 'success', title: `Revoked "${credential.name}"` });
      }
    } catch (error) {
      setNotice({ intent: 'danger', title: `"${credential.name}" was not revoked`, body: credentialErrorMessage(error) });
    } finally {
      setRevoking(current => current.filter(id => id !== credential.id));
      await refresh();
    }
  };

  const columns: TableColumn<CredentialResponse>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: row => (
        <span className={styles.stack}>
          <span>{row.name}</span>
          <Mono>{row.id}</Mono>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: row => (
        <span className={styles.stack}>
          {isRevoked(row) ? (
            <Badge intent="neutral" variant="soft" dot>
              Revoked
            </Badge>
          ) : (
            <Badge intent="success" variant="soft" dot>
              Active
            </Badge>
          )}
          <TestResult test={tests[row.id]} />
        </span>
      ),
    },
    { id: 'hint', header: 'Key', cell: row => <Mono>{hintLabel(row.hint)}</Mono> },
    { id: 'origin', header: 'Origin', cell: row => <Mono>{row.allowedOrigin}</Mono> },
    {
      id: 'referencedBy',
      header: 'Used by',
      cell: row =>
        row.referencedBy.length === 0 ? (
          <Muted>—</Muted>
        ) : (
          <span className={styles.tags}>
            {row.referencedBy.map(provider => (
              <Tag key={provider} size="sm">
                {provider}
              </Tag>
            ))}
          </span>
        ),
    },
    { id: 'rotatedAt', header: 'Rotated', cell: row => (row.rotatedAt ? rotatedLabel(row) : <Muted>{rotatedLabel(row)}</Muted>) },
    { id: 'kid', header: 'Wrapped by', cell: row => (row.kid ? <Mono>{row.kid}</Mono> : <Muted>—</Muted>) },
    {
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => {
        const revoked = isRevoked(row);
        return (
          <div className={controls.rowActions}>
            <Button variant="ghost" size="sm" aria-label={`Test ${row.name}`} disabled={revoked} loading={tests[row.id]?.status === 'running'} onClick={() => void handleTest(row)}>
              Test
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Rotate the key of ${row.name}`} disabled={revoked} onClick={() => setDialog({ kind: 'rotate', credential: row })}>
              Rotate
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Revoke ${row.name}`} disabled={revoked} loading={revoking.includes(row.id)} onClick={() => void handleRevoke(row)}>
              Revoke
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Credentials"
        subtitle="Provider API keys, sealed at rest and bound to the one origin each may be sent to. A catalog provider names a credential instead of holding a key."
        action={
          <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
            New credential
          </Button>
        }
      />
      {notice ? (
        <Alert intent={notice.intent} title={notice.title} onDismiss={() => setNotice(null)} className={styles.notice}>
          {notice.body}
          {notice.catalogLink ? (
            <>
              {' '}
              <Link to="/catalog" search={{ tab: 'draft' }}>
                Open the catalog editor
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}
      {credentials.error ? (
        <Alert intent="danger" title="Couldn't load credentials" className={styles.notice}>
          {credentials.error.message}
        </Alert>
      ) : (
        <Table
          data={sortCredentials(credentials.data?.items ?? [])}
          columns={columns}
          rowKey="id"
          loading={credentials.isLoading}
          aria-label="Provider credentials"
          emptyState="No credentials yet. Create one to bind a provider API key to its origin."
        />
      )}
      {dialog?.kind === 'create' ? <CreateCredentialDialog onClose={() => setDialog(null)} onCreated={handleCreated} /> : null}
      {dialog?.kind === 'rotate' ? <RotateCredentialDialog credential={dialog.credential} onClose={() => setDialog(null)} onRotated={handleRotated} /> : null}
    </>
  );
}
