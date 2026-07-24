/**
 * Importing npm packages
 */
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Button, Table, type TableColumn } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { formatDateTime, FormDrawer, type FormValues, Mono, Muted, PageHeader, StatusBadge, TextOrDash, trimToUndefined } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type PartialResponse, useCreatePartialMutation, useListPartialsQuery, useUpdatePartialMutation } from '@/lib';

import { partialFormConfig } from './forms';

export default function PartialList(): ReactElement {
  const navigate = useNavigate();
  const { data, isLoading } = useListPartialsQuery();

  const [editing, setEditing] = useState<{ open: boolean; row: PartialResponse | null }>({ open: false, row: null });
  const createMutation = useCreatePartialMutation();
  const updateMutation = useUpdatePartialMutation(editing.row?.id ?? '');
  const config = partialFormConfig(editing.row);

  const closeForm = (): void => setEditing(prev => ({ ...prev, open: false }));

  const submit = (values: FormValues): void => {
    const name = String(values.name ?? '').trim();
    const description = trimToUndefined(values.description);
    const isActive = values.isActive !== false;
    if (editing.row) updateMutation.mutate({ name, description, isActive }, { onSuccess: closeForm });
    else createMutation.mutate({ partialKey: String(values.partialKey ?? '').trim(), name, description, isActive }, { onSuccess: closeForm });
  };

  const columns: TableColumn<PartialResponse>[] = [
    { id: 'partialKey', header: 'Partial key', cell: row => <Mono>{row.partialKey}</Mono> },
    { id: 'name', header: 'Name', cell: row => <TextOrDash value={row.name} /> },
    { id: 'description', header: 'Description', cell: row => <TextOrDash value={row.description} /> },
    { id: 'isActive', header: 'Status', cell: row => <StatusBadge active={row.isActive} /> },
    { id: 'updatedAt', header: 'Updated', cell: row => <Muted>{formatDateTime(row.updatedAt)}</Muted> },
    {
      id: '_actions',
      header: '',
      align: 'end',
      cell: row => (
        <div className={controls.rowActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={event => {
              event.stopPropagation();
              setEditing({ open: true, row });
            }}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Partials"
        subtitle="Reusable content blocks included by layouts and templates."
        action={
          <Button variant="primary" onClick={() => setEditing({ open: true, row: null })}>
            New partial
          </Button>
        }
      />
      <Table
        data={data?.items ?? []}
        columns={columns}
        rowKey="id"
        aria-label="Partials"
        loading={isLoading}
        onRowClick={row => navigate({ to: '/design/partials/$partialId', params: { partialId: row.id } })}
        emptyState="No partials yet."
      />
      <FormDrawer
        open={editing.open}
        onOpenChange={open => !open && closeForm()}
        title={config.title}
        meta={config.meta}
        submitLabel={config.submitLabel}
        fields={config.fields}
        initialValues={config.initialValues}
        loading={createMutation.isPending || updateMutation.isPending}
        onSubmit={submit}
      />
    </>
  );
}
