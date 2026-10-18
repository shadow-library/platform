import { useQuery } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Dialog, Spinner, Table, type TableColumn, Textarea, useConfirm } from '@shadow-library/ui';

import { formatDateTime, Mono, TextOrDash, VersionStateBadge } from '@/features/shared';
import { type Notice } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, type CatalogVersionSummaryResponse, isApiError, useRollbackMutation, versionQueryOptions, versionsQueryOptions } from '@/lib';

import { formatCatalog } from './catalog-document';
import { type IssueReport } from './catalog-editor.types';
import { IssueList } from './IssueList';

interface VersionsPanelProps {
  capabilities: Capabilities;
  activeVersion?: number;
  report: IssueReport | null;
  onReport: (report: IssueReport) => void;
  onNotice: (notice: Notice | null) => void;
  onRolledBack: (notice: Notice) => Promise<void>;
}

function VersionViewer({ version, onClose }: { version: number; onClose: () => void }): ReactElement {
  const detail = useQuery(versionQueryOptions(version));
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <Dialog.Content size="lg">
        <Dialog.Header title={`Catalog v${version}`} description={detail.data?.note ?? 'Read-only. Roll back to publish this document again.'} />
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
              aria-label={`Catalog v${version} document`}
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

export function VersionsPanel({ capabilities, activeVersion, report, onReport, onNotice, onRolledBack }: VersionsPanelProps): ReactElement {
  const confirm = useConfirm();
  const versions = useQuery(versionsQueryOptions());
  const rollback = useRollbackMutation();
  const [viewing, setViewing] = useState<number | null>(null);

  const handleRollback = async (version: number): Promise<void> => {
    const confirmed = await confirm({
      title: `Roll back to v${version}?`,
      description: `A new published version is created from v${version}'s document and every app is served it. The draft is left as it is.`,
      confirmLabel: 'Roll back',
      intent: 'danger',
    });
    if (!confirmed) return;
    onNotice(null);
    rollback.mutate(version, {
      onSuccess: outcome => {
        if (outcome.kind === 'invalid') {
          onReport({ source: 'rollback', issues: outcome.issues });
          onNotice({ intent: 'danger', title: `v${version} can no longer be published`, body: 'It fails validation against the active catalog; the issues are listed below.' });
          return;
        }
        void onRolledBack({ intent: 'success', title: `Rolled back to v${version}`, body: `It is now active as v${outcome.value.version}.` });
      },
      onError: error => onNotice({ intent: 'danger', title: "Couldn't roll back", body: isApiError(error) ? error.message : undefined }),
    });
  };

  const columns: TableColumn<CatalogVersionSummaryResponse>[] = [
    { id: 'version', header: 'Version', cell: row => <Mono>v{row.version}</Mono> },
    { id: 'state', header: 'State', cell: row => <VersionStateBadge state={row.state} active={row.version === activeVersion} /> },
    { id: 'note', header: 'Note', cell: row => <TextOrDash value={row.note} /> },
    { id: 'createdBy', header: 'By', cell: row => <TextOrDash value={row.createdBy} mono /> },
    { id: 'publishedAt', header: 'Published', cell: row => formatDateTime(row.publishedAt ?? row.createdAt) },
    {
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => (
        <div className={controls.rowActions}>
          <Button variant="ghost" size="sm" onClick={() => setViewing(row.version)} aria-label={`View v${row.version}`}>
            View
          </Button>
          {capabilities.publish && row.version !== activeVersion ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleRollback(row.version)}
              loading={rollback.isPending && rollback.variables === row.version}
              aria-label={`Roll back to v${row.version}`}
            >
              Roll back
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  if (versions.error)
    return (
      <Alert intent="danger" title="Couldn't load the version history">
        {versions.error.message}
      </Alert>
    );

  return (
    <>
      <Table
        data={versions.data?.items ?? []}
        columns={columns}
        rowKey={row => String(row.version)}
        loading={versions.isLoading}
        aria-label="Catalog versions"
        emptyState="Nothing has been published yet."
      />
      {report ? <IssueList issues={report.issues} label="Issues that blocked the rollback" /> : null}
      {viewing === null ? null : <VersionViewer version={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
