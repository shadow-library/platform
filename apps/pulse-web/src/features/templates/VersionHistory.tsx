/**
 * Importing npm packages
 */
import { type ReactElement, useState } from 'react';
import { Alert, Button, Table, type TableColumn } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { formatDateTime, Mono, Muted, SectionHeader, TextOrDash, useConfirm, VersionStatusBadge } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { useRollbackVersionMutation, type VersionResponse } from '@/lib';

export default function VersionHistory({ templateId, versions }: { templateId: string; versions: VersionResponse[] }): ReactElement {
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const mutation = useRollbackVersionMutation(templateId);

  const rollback = async (version: number): Promise<void> => {
    if (
      !(await confirm({
        title: `Roll back to v${version}?`,
        description: 'A new published version is created from this version’s content.',
        confirmLabel: 'Roll back',
        intent: 'primary',
      }))
    )
      return;
    setError('');
    mutation.mutate({ version }, { onError: apiError => setError(apiError.message) });
  };

  const columns: TableColumn<VersionResponse>[] = [
    { id: 'version', header: 'Version', cell: row => <Mono>v{row.version}</Mono> },
    { id: 'status', header: 'Status', cell: row => <VersionStatusBadge status={row.status} /> },
    { id: 'editedBy', header: 'Edited by', cell: row => <TextOrDash value={row.editedBy} /> },
    { id: 'publishedAt', header: 'Published', cell: row => <Muted>{formatDateTime(row.publishedAt)}</Muted> },
    { id: 'notes', header: 'Notes', cell: row => <TextOrDash value={row.notes} /> },
    {
      id: '_actions',
      header: '',
      align: 'end',
      cell: row =>
        row.status === 'ARCHIVED' ? (
          <div className={controls.rowActions}>
            <Button variant="ghost" size="sm" onClick={() => void rollback(row.version)}>
              Roll back
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <SectionHeader title="Version history" subtitle="Every publish archives the previous version; roll an archived version back to republish it." />
      {error ? (
        <Alert intent="danger" title="Couldn't roll back" className={controls.detailCard}>
          {error}
        </Alert>
      ) : null}
      <Table data={versions} columns={columns} rowKey="version" aria-label="Template versions" emptyState="No versions yet." />
    </>
  );
}
