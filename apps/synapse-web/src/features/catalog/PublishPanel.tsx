import { useQuery } from '@tanstack/react-query';
import { type ReactElement, type ReactNode } from 'react';
import { Alert, Badge, Button, Card, Spinner, useConfirm } from '@shadow-library/ui';

import { type Notice } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, diffQueryOptions, type DraftDiffResponse, isCatalogConflict, usePublishDraftMutation } from '@/lib';

import { type IssueReport } from './catalog-editor.types';
import styles from './Catalog.module.css';
import { IssueList } from './IssueList';

interface PublishPanelProps {
  capabilities: Capabilities;
  /** Fingerprint of the saved draft this editor last loaded or saved. */
  fingerprint: string | null;
  dirty: boolean;
  report: IssueReport | null;
  onReport: (report: IssueReport) => void;
  onNotice: (notice: Notice | null) => void;
  onPublished: (notice: Notice) => Promise<void>;
  onConflict: () => Promise<void>;
}

function DiffColumn({ title, paths, tone, intent }: { title: string; paths: string[]; tone: string; intent: 'success' | 'danger' | 'warning' }): ReactElement {
  return (
    <Card padding="md">
      <Card.Header
        title={title}
        action={
          <Badge intent={intent} variant="soft">
            {paths.length}
          </Badge>
        }
      />
      <Card.Body>
        {paths.length === 0 ? (
          <p className={controls.hint}>None</p>
        ) : (
          <ul className={styles.diffList} aria-label={`${title} paths`}>
            {paths.map(path => (
              <li key={path} className={tone}>
                {path}
              </li>
            ))}
          </ul>
        )}
      </Card.Body>
    </Card>
  );
}

function diffSummary(diff: DraftDiffResponse): string {
  return `${diff.added.length} added, ${diff.removed.length} removed and ${diff.changed.length} changed path(s)`;
}

export function PublishPanel({ capabilities, fingerprint, dirty, report, onReport, onNotice, onPublished, onConflict }: PublishPanelProps): ReactElement {
  const diff = useQuery(diffQueryOptions());
  const publish = usePublishDraftMutation();
  const confirm = useConfirm();

  if (diff.isLoading)
    return (
      <div className={controls.loading}>
        <Spinner aria-label="Loading the diff" />
      </div>
    );
  if (diff.error)
    return (
      <Alert intent="danger" title="Couldn't load the diff">
        {diff.error.message}
      </Alert>
    );
  if (!diff.data)
    return (
      <Alert intent="info" title="There is no draft to publish">
        Save a draft in the Draft tab first.
      </Alert>
    );

  const changes = diff.data;
  const unchanged = changes.added.length + changes.removed.length + changes.changed.length === 0;
  /** The diff shown is the one published: its fingerprint goes to the server, so it must be of the draft this editor holds, and current. */
  const diffMatchesEditor = changes.fingerprint === fingerprint;
  const publishable = diffMatchesEditor && !diff.isFetching;

  /** Publishes the fingerprint the question described; a draft saved meanwhile is the server's conflict to report. */
  const handlePublish = async (): Promise<void> => {
    const confirmed = await confirm({
      title: 'Publish this draft?',
      description: `It replaces the active catalog for every app with ${unchanged ? 'an identical document' : diffSummary(changes)}. The current version is archived and can be rolled back to.`,
      confirmLabel: 'Publish',
      intent: 'danger',
    });
    if (!confirmed) return;
    onNotice(null);
    publish.mutate(changes.fingerprint, {
      onSuccess: outcome => {
        if (outcome.kind === 'invalid') {
          onReport({ source: 'publish', issues: outcome.issues });
          onNotice({ intent: 'danger', title: 'Publishing was refused', body: `${outcome.issues.length} issue(s) block it; they are listed below.` });
          return;
        }
        void onPublished({ intent: 'success', title: `Published catalog v${outcome.value.version}`, body: 'Replicas pick it up on their next poll.' });
      },
      onError: error => {
        if (isCatalogConflict(error)) return void onConflict();
        onNotice({ intent: 'danger', title: "Couldn't publish the draft", body: error.message });
      },
    });
  };

  const renderAction = (): ReactNode => {
    if (!capabilities.publish) return <p className={controls.hint}>Your role cannot publish the catalog.</p>;
    if (dirty)
      return (
        <Alert intent="warning" title="You have unsaved edits" className={styles.confirm}>
          Publishing uses the saved draft. Save your edits first, then review the diff again.
        </Alert>
      );
    if (!diffMatchesEditor && !diff.isFetching)
      return (
        <Alert intent="warning" title="The draft changed since you loaded it" className={styles.confirm} action={{ label: 'Reload', onClick: () => void onConflict() }}>
          The saved draft is no longer the one in the editor. Reload to review the current draft before publishing it.
        </Alert>
      );
    return (
      <div className={styles.publishActions}>
        <Button variant="primary" onClick={() => void handlePublish()} loading={publish.isPending} disabled={!publishable}>
          Review and publish
        </Button>
      </div>
    );
  };

  return (
    <>
      <p className={styles.status}>{unchanged ? 'The saved draft matches the active catalog.' : `Against the active catalog: ${diffSummary(changes)}.`}</p>
      <div className={styles.diffGrid}>
        <DiffColumn title="Added" paths={changes.added} tone={styles.added ?? ''} intent="success" />
        <DiffColumn title="Removed" paths={changes.removed} tone={styles.removed ?? ''} intent="danger" />
        <DiffColumn title="Changed" paths={changes.changed} tone={styles.changed ?? ''} intent="warning" />
      </div>
      {renderAction()}
      {report ? <IssueList issues={report.issues} label="Issues that blocked publishing" /> : null}
    </>
  );
}
