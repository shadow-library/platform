import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Dialog, EmptyState, Spinner, Textarea, useConfirm } from '@shadow-library/ui';

import { activeVersionOf, type CatalogDocument, describeChanges, formatCatalog } from '@/features/catalog';
import { credentialNamer, nameCredentialChanges } from '@/features/changes';
import { editorLabel, formatDateTime, formatRelativeTime, Mono, type Notice, PageHeader, PermissionGate, useMinuteClock, VersionStateBadge } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import {
  type CatalogIssueResponse,
  type CatalogVersionSummaryResponse,
  credentialsQueryOptions,
  isApiError,
  isCatalogConflict,
  meQuery,
  useCapabilities,
  useRollbackMutation,
  versionQueryOptions,
  versionsQueryOptions,
} from '@/lib';

import { groupChanges, listVersions, predecessorOf, rollbackDescription, rollbackIssueRows } from './history-view';
import styles from './History.module.css';

interface RollbackFailure {
  version: number;
  issues: CatalogIssueResponse[];
  document: CatalogDocument | null;
}

export function HistoryScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <HistoryView canRollBack={capabilities.writeCatalog} />
    </PermissionGate>
  );
}

function Chevron(): ReactElement {
  return (
    <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 4L10.5 8l-4 4" />
    </svg>
  );
}

function RawDocumentDialog({ version, onClose }: { version: number; onClose: () => void }): ReactElement {
  const detail = useQuery(versionQueryOptions(version));
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <Dialog.Content size="lg">
        <Dialog.Header title={`Version ${version}: raw document`} description={detail.data?.note ?? 'Read-only. Roll back to make this version live again.'} />
        <Dialog.Body>
          {detail.error ? (
            <Alert intent="danger" title="Couldn't load this version">
              {detail.error.message}
            </Alert>
          ) : detail.data ? (
            <Textarea
              mono
              wrap="off"
              value={formatCatalog(detail.data.document)}
              readOnly
              autoGrow={false}
              minRows={24}
              spellCheck={false}
              aria-label={`Version ${version} document`}
            />
          ) : (
            <div className={controls.loading}>
              <Spinner aria-label="Loading the version" />
            </div>
          )}
        </Dialog.Body>
      </Dialog.Content>
    </Dialog>
  );
}

function VersionChanges({ version, predecessor }: { version: number; predecessor: number | null }): ReactElement {
  const current = useQuery(versionQueryOptions(version));
  const previous = useQuery({ ...versionQueryOptions(predecessor ?? 0), enabled: predecessor !== null });
  const { manageCredentials } = useCapabilities();
  const credentials = useQuery({ ...credentialsQueryOptions(), enabled: manageCredentials });

  const error = current.error ?? previous.error;
  if (error)
    return (
      <Alert intent="danger" title="Couldn't load what changed">
        {error.message}
      </Alert>
    );
  if (!current.data || (predecessor !== null && !previous.data))
    return (
      <div className={controls.loading}>
        <Spinner aria-label="Loading what changed" />
      </div>
    );
  if (predecessor === null) return <p className={controls.hint}>First version.</p>;

  const before = previous.data?.document ?? null;
  const changes = describeChanges(before, current.data.document);
  const groups = groupChanges(nameCredentialChanges(changes, before, current.data.document, credentialNamer(credentials.data?.items)));
  if (groups.length === 0) return <p className={controls.hint}>No settings changed compared with version {predecessor}.</p>;

  return (
    <>
      {groups.map(group => (
        <section key={group.area} className={styles.group}>
          <h4 className={styles.groupTitle}>{group.title}</h4>
          <ul className={styles.sentences}>
            {group.changes.map(change => (
              <li key={`${change.entityKey}:${change.field ?? ''}:${change.sentence}`}>{change.sentence}</li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

interface VersionItemProps {
  row: CatalogVersionSummaryResponse;
  predecessor: number | null;
  active: boolean;
  open: boolean;
  now: number | null;
  meSubject: string | undefined;
  canRollBack: boolean;
  rollingBack: boolean;
  rollbackBusy: boolean;
  onToggle: () => void;
  onViewRaw: () => void;
  onRollBack: () => void;
}

function VersionItem({ row, predecessor, active, open, now, meSubject, canRollBack, rollingBack, rollbackBusy, onToggle, onViewRaw, onRollBack }: VersionItemProps): ReactElement {
  const editor = editorLabel(row, meSubject);
  const when = row.publishedAt ?? row.createdAt;
  return (
    <li className={styles.item}>
      <div className={styles.row}>
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={`version-${row.version}`} onClick={onToggle}>
          <Chevron />
          <span className={styles.summary}>
            <span className={styles.heading}>
              <span className={styles.version}>Version {row.version}</span>
              <VersionStateBadge active={active} />
              {row.note ? <span className={styles.note}>{row.note}</span> : null}
            </span>
            <span className={styles.meta}>
              <span>{formatDateTime(when)}</span>
              {now === null ? null : <span>{formatRelativeTime(when, new Date(now))}</span>}
              {editor ? <span>by {editor}</span> : null}
            </span>
          </span>
        </button>
        <div className={controls.rowActions}>
          <Button variant="ghost" size="sm" onClick={onViewRaw} aria-label={`View raw document of version ${row.version}`}>
            View raw document
          </Button>
          {canRollBack && !active ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRollBack}
              loading={rollingBack}
              disabled={rollbackBusy && !rollingBack}
              aria-label={`Roll back to version ${row.version}`}
            >
              Roll back
            </Button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div id={`version-${row.version}`} className={styles.details}>
          <VersionChanges version={row.version} predecessor={predecessor} />
        </div>
      ) : null}
    </li>
  );
}

function RollbackIssues({ failure }: { failure: RollbackFailure }): ReactElement {
  const rows = rollbackIssueRows(failure.issues, failure.document);
  return (
    <Alert intent="danger" title={`Version ${failure.version} can no longer be made live`}>
      It no longer passes the catalog checks, so nothing was changed. What is wrong:
      <ul className={styles.issues}>
        {rows.map(row => (
          <li key={row.key}>
            {row.sentence}
            {row.owner ? (
              <>
                {' '}
                <Mono>{row.owner}</Mono>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <details className={styles.technical}>
        <summary>Technical details</summary>
        {rows.map(row => (
          <span key={row.key} className={styles.path}>
            {row.path === '' ? '(document)' : row.path}
          </span>
        ))}
      </details>
    </Alert>
  );
}

function HistoryView({ canRollBack }: { canRollBack: boolean }): ReactElement {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const versions = useQuery(versionsQueryOptions());
  const me = useQuery(meQuery);
  const rollback = useRollbackMutation();
  const now = useMinuteClock();
  const [openVersions, setOpenVersions] = useState<readonly number[]>([]);
  const [rawVersion, setRawVersion] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [failure, setFailure] = useState<RollbackFailure | null>(null);

  const items = listVersions(versions.data?.items ?? []);
  const activeVersion = versions.data ? activeVersionOf(versions.data.items)?.version : undefined;

  const toggle = (version: number): void => setOpenVersions(open => (open.includes(version) ? open.filter(item => item !== version) : [...open, version]));

  const reportInvalid = async (version: number, issues: CatalogIssueResponse[]): Promise<void> => {
    const detail = await queryClient.ensureQueryData(versionQueryOptions(version)).catch(() => null);
    setFailure({ version, issues, document: detail?.document ?? null });
  };

  const handleRollback = async (version: number): Promise<void> => {
    if (activeVersion === undefined) return;
    const confirmed = await confirm({
      title: `Roll back to version ${version}?`,
      description: rollbackDescription(version),
      confirmLabel: 'Roll back',
      intent: 'danger',
    });
    if (!confirmed) return;
    setNotice(null);
    setFailure(null);
    rollback.mutate(
      { version, expectedVersion: activeVersion },
      {
        onSuccess: outcome => {
          if (outcome.kind === 'invalid') return void reportInvalid(version, outcome.issues);
          setNotice({ intent: 'success', title: `Rolled back to version ${version}`, body: `It is now live as version ${outcome.value.version}.` });
        },
        onError: error => {
          if (isCatalogConflict(error))
            return setNotice({
              intent: 'warning',
              title: "Couldn't roll back",
              body: 'Someone else changed the catalog meanwhile. The list now shows their version; check it and try again.',
            });
          setNotice({ intent: 'danger', title: "Couldn't roll back", body: isApiError(error) ? error.message : undefined });
        },
      },
    );
  };

  return (
    <>
      <PageHeader title="History" subtitle="Every version of the catalog that went live: what changed, who changed it and when." />
      {notice ? (
        <Alert intent={notice.intent} title={notice.title} onDismiss={() => setNotice(null)} className={styles.notice}>
          {notice.body}
        </Alert>
      ) : null}
      {failure ? <RollbackIssues failure={failure} /> : null}
      {versions.error ? (
        <Alert intent="danger" title="Couldn't load the version history">
          {versions.error.message}
        </Alert>
      ) : versions.isLoading ? (
        <div className={controls.loading}>
          <Spinner aria-label="Loading the version history" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No catalog is live yet" description="Versions appear here once the first change goes live." />
      ) : (
        <ul className={styles.list} aria-label="Catalog versions">
          {items.map(row => (
            <VersionItem
              key={row.version}
              row={row}
              predecessor={predecessorOf(items, row.version)}
              active={row.version === activeVersion}
              open={openVersions.includes(row.version)}
              now={now}
              meSubject={me.data?.sub}
              canRollBack={canRollBack}
              rollingBack={rollback.isPending && rollback.variables?.version === row.version}
              rollbackBusy={rollback.isPending}
              onToggle={() => toggle(row.version)}
              onViewRaw={() => setRawVersion(row.version)}
              onRollBack={() => void handleRollback(row.version)}
            />
          ))}
        </ul>
      )}
      {rawVersion === null ? null : <RawDocumentDialog version={rawVersion} onClose={() => setRawVersion(null)} />}
    </>
  );
}
