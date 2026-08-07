import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, FormField, Input, Table, type TableColumn, Textarea } from '@shadow-library/ui';

import { formatDateTime, Mono, Muted, SectionHeader, TextOrDash, VersionStatusBadge } from '@/features/shared';
import { type VersionStatus } from '@/lib';

import styles from './Design.module.css';

interface DesignVersion {
  version: number;
  status: VersionStatus;
  body: string;
  notes?: string;
  publishedAt?: string;
}

interface DesignEditorProps {
  defaultBody: string;
  versions: DesignVersion[];
  saving: boolean;
  publishing: boolean;
  saveError?: string;
  publishError?: string;
  onSaveDraft: (body: string, notes?: string) => void;
  onPublish: (notes?: string) => void;
}

export default function DesignEditor(props: DesignEditorProps): ReactElement {
  const { defaultBody, versions, saving, publishing, saveError, publishError, onSaveDraft, onPublish } = props;
  const [body, setBody] = useState(defaultBody);
  const [notes, setNotes] = useState('');

  const columns: TableColumn<DesignVersion>[] = [
    { id: 'version', header: 'Version', cell: row => <Mono>v{row.version}</Mono> },
    { id: 'status', header: 'Status', cell: row => <VersionStatusBadge status={row.status} /> },
    { id: 'publishedAt', header: 'Published', cell: row => <Muted>{formatDateTime(row.publishedAt)}</Muted> },
    { id: 'notes', header: 'Notes', cell: row => <TextOrDash value={row.notes} /> },
  ];

  return (
    <>
      <SectionHeader title="Draft" subtitle="Edit the working draft body, then publish it as the next version." />
      <Card padding="md">
        <Card.Body>
          <div className={styles.editor}>
            <FormField label="Body" required helper="Liquid template for the shell/block.">
              <Textarea value={body} onValueChange={setBody} minRows={12} placeholder="<html>… {{ content }} …</html>" />
            </FormField>
            <FormField label="Notes" optional>
              <Input value={notes} onValueChange={setNotes} placeholder="What changed" />
            </FormField>
            {saveError ? (
              <Alert intent="danger" title="Couldn't save draft">
                {saveError}
              </Alert>
            ) : null}
            {publishError ? (
              <Alert intent="danger" title="Couldn't publish">
                {publishError}
              </Alert>
            ) : null}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => onSaveDraft(body, notes.trim() || undefined)} loading={saving}>
                Save draft
              </Button>
              <Button variant="primary" onClick={() => onPublish(notes.trim() || undefined)} loading={publishing}>
                Publish
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>

      <div className={styles.versions}>
        <SectionHeader title="Version history" subtitle="Every publish archives the previous version." />
        <Table data={versions} columns={columns} rowKey="version" aria-label="Versions" emptyState="No versions yet." />
      </div>
    </>
  );
}
