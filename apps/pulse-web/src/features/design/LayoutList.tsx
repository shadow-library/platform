import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Button, Table, type TableColumn } from '@shadow-library/ui';

import { formatDateTime, FormDrawer, type FormValues, Mono, Muted, PageHeader, StatusBadge, TextOrDash, trimToUndefined } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type LayoutResponse, useCreateLayoutMutation, useListLayoutsQuery, useUpdateLayoutMutation } from '@/lib';

import { layoutFormConfig } from './forms';

export default function LayoutList(): ReactElement {
  const navigate = useNavigate();
  const { data, isLoading } = useListLayoutsQuery();

  const [editing, setEditing] = useState<{ open: boolean; row: LayoutResponse | null }>({ open: false, row: null });
  const createMutation = useCreateLayoutMutation();
  const updateMutation = useUpdateLayoutMutation(editing.row?.id ?? '');
  const config = layoutFormConfig(editing.row);

  const closeForm = (): void => setEditing(prev => ({ ...prev, open: false }));

  const submit = (values: FormValues): void => {
    const name = String(values.name ?? '').trim();
    const description = trimToUndefined(values.description);
    const isActive = values.isActive !== false;
    if (editing.row) updateMutation.mutate({ name, description, isActive }, { onSuccess: closeForm });
    else createMutation.mutate({ layoutKey: String(values.layoutKey ?? '').trim(), name, description, isActive }, { onSuccess: closeForm });
  };

  const columns: TableColumn<LayoutResponse>[] = [
    { id: 'layoutKey', header: 'Layout key', cell: row => <Mono>{row.layoutKey}</Mono> },
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
        title="Layouts"
        subtitle="Design-system shells that wrap template bodies."
        action={
          <Button variant="primary" onClick={() => setEditing({ open: true, row: null })}>
            New layout
          </Button>
        }
      />
      <Table
        data={data?.items ?? []}
        columns={columns}
        rowKey="id"
        aria-label="Layouts"
        loading={isLoading}
        onRowClick={row => navigate({ to: '/design/layouts/$layoutId', params: { layoutId: row.id } })}
        emptyState="No layouts yet."
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
