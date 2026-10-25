import { useQuery } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Dialog, EmptyState, Spinner, Textarea } from '@shadow-library/ui';

import { activeVersionOf, describeChanges, formatCatalog } from '@/features/catalog';
import { ChangeList, credentialNamer, nameCredentialChanges, type RestoreTarget, useChangeFlow } from '@/features/changes';
import {
  editorLabel,
  formatDateTime,
  formatRelativeTime,
  type IssueNotice,
  IssueNoticeAlert,
  PageHeader,
  PermissionGate,
  useMinuteClock,
  VersionStateBadge,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type CatalogVersionSummaryResponse, credentialsQueryOptions, meQuery, useCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

import { listVersions, predecessorOf, restoreResultNotice, restoreTargetOf, versionNote } from './history-view';
import styles from './History.module.css';

export function HistoryScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <HistoryView canWrite={capabilities.writeCatalog} />
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
        <Dialog.Header title={`Version ${version}: raw document`} description={versionNote(detail.data?.note) ?? 'Read-only.'} />
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
  const changes = nameCredentialChanges(describeChanges(before, current.data.document), before, current.data.document, credentialNamer(credentials.data?.items));
  if (changes.length === 0) return <p className={controls.hint}>No settings changed compared with version {predecessor}.</p>;

  return (
    <div className={styles.changes}>
      <ChangeList changes={changes} />
    </div>
  );
}

interface VersionItemProps {
  row: CatalogVersionSummaryResponse;
  predecessor: number | null;
  active: boolean;
  open: boolean;
  now: number | null;
  meSubject: string | undefined;
  target: RestoreTarget | null;
  busy: boolean;
  restoring: boolean;
  onToggle: () => void;
  onViewRaw: () => void;
  onRestore: (target: RestoreTarget) => void;
}

function VersionItem({ row, predecessor, active, open, now, meSubject, target, busy, restoring, onToggle, onViewRaw, onRestore }: VersionItemProps): ReactElement {
  const editor = editorLabel(row, meSubject);
  const when = row.publishedAt ?? row.createdAt;
  const note = versionNote(row.note);
  return (
    <li className={styles.item}>
      <div className={styles.row}>
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={`version-${row.version}`} onClick={onToggle}>
          <Chevron />
          <span className={styles.summary}>
            <span className={styles.heading}>
              <span className={styles.version}>Version {row.version}</span>
              <VersionStateBadge active={active} />
              {note ? <span className={styles.note}>{note}</span> : null}
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
          {target ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRestore(target)}
              loading={restoring}
              disabled={busy && !restoring}
              aria-label={target.kind === 'undo' ? `Undo version ${row.version}` : `Restore version ${row.version}`}
            >
              {target.kind === 'undo' ? 'Undo' : 'Restore this version'}
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

function HistoryView({ canWrite }: { canWrite: boolean }): ReactElement {
  const flow = useChangeFlow();
  const versions = useQuery(versionsQueryOptions());
  const me = useQuery(meQuery);
  const now = useMinuteClock();
  const [openVersions, setOpenVersions] = useState<readonly number[]>([]);
  const [rawVersion, setRawVersion] = useState<number | null>(null);
  const [notice, setNotice] = useState<IssueNotice | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  const items = listVersions(versions.data?.items ?? []);
  const activeVersion = versions.data ? activeVersionOf(versions.data.items)?.version : undefined;

  const toggle = (version: number): void => setOpenVersions(open => (open.includes(version) ? open.filter(item => item !== version) : [...open, version]));

  const restore = async (target: RestoreTarget): Promise<void> => {
    setNotice(null);
    setRestoring(target.kind === 'undo' ? target.expectedLive : target.version);
    const result = await flow.confirmRestore(target);
    setRestoring(null);
    setNotice(restoreResultNotice(result, target));
  };

  return (
    <>
      <PageHeader title="History" subtitle="Every version of the catalog that went live: what changed, who changed it and when." />
      {notice ? <IssueNoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      {canWrite || items.length === 0 ? null : <p className={controls.hint}>Your role can see every version but can&apos;t undo or restore one.</p>}
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
          {items.map(row => {
            const predecessor = predecessorOf(items, row.version);
            return (
              <VersionItem
                key={row.version}
                row={row}
                predecessor={predecessor}
                active={row.version === activeVersion}
                open={openVersions.includes(row.version)}
                now={now}
                meSubject={me.data?.sub}
                target={restoreTargetOf(row.version, { activeVersion, predecessor, canWrite })}
                busy={flow.pending}
                restoring={flow.pending && restoring === row.version}
                onToggle={() => toggle(row.version)}
                onViewRaw={() => setRawVersion(row.version)}
                onRestore={target => void restore(target)}
              />
            );
          })}
        </ul>
      )}
      {rawVersion === null ? null : <RawDocumentDialog version={rawVersion} onClose={() => setRawVersion(null)} />}
    </>
  );
}
