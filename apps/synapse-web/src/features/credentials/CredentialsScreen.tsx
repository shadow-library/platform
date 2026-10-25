import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Table, type TableColumn, Tag, useConfirm } from '@shadow-library/ui';

import { Mono, Muted, type Notice, PageHeader, PermissionGate, providerName, RevokeIcon, RotateIcon, RowAction, RowActions, TestIcon } from '@/features/shared';
import { credentialKeys, type CredentialResponse, credentialsQueryOptions, revokeCredential, testCredential, useCapabilities } from '@/lib';

import { CreateCredentialDialog, RotateCredentialDialog } from './CredentialDialogs';
import {
  credentialErrorMessage,
  describeTest,
  destinationLabel,
  hintLabel,
  inUseMessage,
  isRevoked,
  keyVersionLabel,
  revokeDescription,
  revokedLabel,
  sortCredentials,
  type TestReport,
} from './credential-view';
import styles from './Credentials.module.css';
import { useKeyDestinations } from './use-key-destinations';

type DialogState = { kind: 'create' } | { kind: 'rotate'; credential: CredentialResponse } | null;

type ScreenNotice = Notice & { providersLink?: boolean };

type RowTest = { status: 'running' } | ({ status: 'done' } & TestReport);

export function CredentialsScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.manageCredentials} area="provider credentials">
      <CredentialsView />
    </PermissionGate>
  );
}

function TestResult({ test }: { test?: RowTest }): ReactElement {
  if (!test) return <Muted>Not tested in this session</Muted>;
  if (test.status === 'running') return <span className={styles.testRunning}>Testing…</span>;
  return <span className={test.ok ? styles.testOk : styles.testFailed}>{test.message}</span>;
}

function CredentialsView(): ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const credentials = useQuery(credentialsQueryOptions());
  const destinations = useKeyDestinations();
  const keyDestinations = destinations.status === 'ready' ? destinations.items : undefined;
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [tests, setTests] = useState<Record<string, RowTest>>({});
  const [revoking, setRevoking] = useState<readonly string[]>([]);

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: credentialKeys.all });

  const forgetTest = (id: string): void => setTests(({ [id]: _forgotten, ...rest }) => rest);

  const handleCreated = (credential: CredentialResponse): void => {
    setDialog(null);
    setNotice({ intent: 'success', title: `Created "${credential.name}"`, body: 'Choose it for a provider on the Providers screen.', providersLink: true });
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
      if (outcome.kind === 'in_use') setNotice({ intent: 'danger', title: `"${credential.name}" is still in use`, body: inUseMessage(outcome.referencedBy), providersLink: true });
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
        <span className={styles.cell}>
          <span>{row.name}</span>
          <Muted>{destinationLabel(row.allowedOrigin, keyDestinations)}</Muted>
          <details className={styles.details}>
            <summary>Technical details</summary>
            <span className={styles.detailLines}>
              <span>
                ID <Mono>{row.id}</Mono>
              </span>
              <span>
                Address <Mono>{row.allowedOrigin}</Mono>
              </span>
              {row.kid ? (
                <span>
                  Sealed with keyring key <Mono>{row.kid}</Mono>
                </span>
              ) : null}
            </span>
          </details>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: row => {
        const revoked = revokedLabel(row);
        return (
          <span className={styles.cell}>
            <span>
              {revoked ? (
                <Badge intent="neutral" variant="soft" dot>
                  Revoked
                </Badge>
              ) : (
                <Badge intent="success" variant="soft" dot>
                  Active
                </Badge>
              )}
            </span>
            {revoked ? <Muted>{revoked}</Muted> : <TestResult test={tests[row.id]} />}
          </span>
        );
      },
    },
    {
      id: 'key',
      header: 'API key',
      cell: row => (
        <span className={styles.cell}>
          <Mono>{hintLabel(row.hint)}</Mono>
          <Muted>{keyVersionLabel(row)}</Muted>
        </span>
      ),
    },
    {
      id: 'referencedBy',
      header: 'Used by providers',
      cell: row =>
        row.referencedBy.length === 0 ? (
          <Muted>None yet</Muted>
        ) : (
          <span className={styles.tags}>
            {row.referencedBy.map(provider => (
              <Tag key={provider} size="sm">
                {providerName(provider)}
              </Tag>
            ))}
          </span>
        ),
    },
    {
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => {
        const revoked = isRevoked(row);
        return (
          <RowActions>
            <RowAction
              icon={<TestIcon />}
              label={`Test ${row.name}`}
              tooltip={revoked ? 'A revoked key can no longer be tested' : 'Test the key'}
              disabled={revoked}
              loading={tests[row.id]?.status === 'running'}
              onClick={() => void handleTest(row)}
            />
            <RowAction
              icon={<RotateIcon />}
              label={`Rotate the key of ${row.name}`}
              tooltip={revoked ? 'A revoked key can no longer be replaced' : 'Replace the key'}
              disabled={revoked}
              onClick={() => setDialog({ kind: 'rotate', credential: row })}
            />
            <RowAction
              icon={<RevokeIcon />}
              label={`Revoke ${row.name}`}
              tooltip={revoked ? 'Already revoked' : 'Revoke'}
              danger
              disabled={revoked}
              loading={revoking.includes(row.id)}
              onClick={() => void handleRevoke(row)}
            />
          </RowActions>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Credentials"
        subtitle="Provider API keys, stored encrypted. Each key is only ever sent to one address. A provider picks a stored key here instead of holding one."
        action={
          <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
            New credential
          </Button>
        }
      />
      {notice ? (
        <Alert intent={notice.intent} title={notice.title} onDismiss={() => setNotice(null)} className={styles.notice}>
          {notice.body}
          {notice.providersLink ? (
            <>
              {' '}
              <Link to="/providers">Open Providers</Link>
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
          emptyState="No API keys stored yet. Add one with New credential, then choose it for a provider on the Providers screen."
        />
      )}
      {dialog?.kind === 'create' ? (
        <CreateCredentialDialog takenNames={credentials.data?.items.map(item => item.name) ?? []} onClose={() => setDialog(null)} onCreated={handleCreated} />
      ) : null}
      {dialog?.kind === 'rotate' ? <RotateCredentialDialog credential={dialog.credential} onClose={() => setDialog(null)} onRotated={handleRotated} /> : null}
    </>
  );
}
