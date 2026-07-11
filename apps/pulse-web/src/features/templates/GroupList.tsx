/**
 * Importing npm packages
 */
import { Button, Input, Pagination, Table, type TableColumn } from '@shadow-library/ui';
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';

/**
 * Importing user defined packages
 */
import {
  FormDrawer,
  type FormValues,
  Mono,
  Muted,
  OutlineBadge,
  PAGE_SIZE_OPTIONS,
  PageHeader,
  PriorityBadge,
  SearchIcon,
  StatusBadge,
  TextOrDash,
  formatDateTime,
  trimToUndefined,
  useDebouncedParam,
  useTablePagination,
  useTableSort,
} from '@/features/shared';
import { type MessageType, type Priority, type TemplateGroupResponse, useCreateTemplateGroupMutation, useListTemplateGroupsQuery, useSearchParams, useUpdateTemplateGroupMutation } from '@/lib';

import { groupFormConfig } from './forms';

import controls from '@/features/shared/controls.module.css';

export default function GroupList(): ReactElement {
  const navigate = useNavigate();
  const { search } = useSearchParams();
  const { data, isLoading } = useListTemplateGroupsQuery(search);
  const [searchValue, setSearchValue] = useDebouncedParam('key');
  const pagination = useTablePagination(data?.total);
  const { sort, onSortChange } = useTableSort({ id: 'updatedAt', direction: 'desc' });

  const [editing, setEditing] = useState<{ open: boolean; row: TemplateGroupResponse | null }>({ open: false, row: null });
  const createMutation = useCreateTemplateGroupMutation();
  const updateMutation = useUpdateTemplateGroupMutation(editing.row?.id ?? '');
  const config = groupFormConfig(editing.row);

  const closeForm = (): void => setEditing(prev => ({ ...prev, open: false }));

  const submit = (values: FormValues): void => {
    const priority = values.priority === 'NONE' ? undefined : (values.priority as Priority | undefined);
    const description = trimToUndefined(values.description);
    const isActive = values.isActive !== false;
    if (editing.row) updateMutation.mutate({ messageType: values.messageType as MessageType, description, priority, isActive }, { onSuccess: closeForm });
    else createMutation.mutate({ templateKey: String(values.templateKey ?? '').trim(), messageType: values.messageType as MessageType, description, priority, isActive }, { onSuccess: closeForm });
  };

  const columns: TableColumn<TemplateGroupResponse>[] = [
    { id: 'templateKey', header: 'Template key', cell: row => <Mono>{row.templateKey}</Mono> },
    { id: 'messageType', header: 'Type', cell: row => <OutlineBadge>{row.messageType}</OutlineBadge> },
    { id: 'description', header: 'Description', cell: row => <TextOrDash value={row.description} /> },
    { id: 'priority', header: 'Priority', cell: row => <PriorityBadge priority={row.priority} /> },
    { id: 'isActive', header: 'Status', cell: row => <StatusBadge active={!!row.isActive} /> },
    { id: 'updatedAt', header: 'Updated', sortable: true, cell: row => <Muted>{formatDateTime(row.updatedAt)}</Muted> },
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
        title="Template Groups"
        subtitle="Notification templates, each identified by a unique template key."
        action={
          <Button variant="primary" onClick={() => setEditing({ open: true, row: null })}>
            New template group
          </Button>
        }
      />
      <div className={controls.toolbar}>
        <Input className={controls.searchWide} value={searchValue} onValueChange={setSearchValue} placeholder="Search by template key" prefix={<SearchIcon />} clearable />
      </div>
      <Table
        data={data?.items ?? []}
        columns={columns}
        rowKey="id"
        aria-label="Template groups"
        loading={isLoading}
        onRowClick={row => navigate({ to: '/templates/$groupId', params: { groupId: row.id } })}
        sort={sort}
        onSortChange={onSortChange}
        emptyState="No template groups match your search."
      />
      <div className={controls.pagination}>
        <Pagination
          page={pagination.page}
          onPageChange={pagination.onPageChange}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageSizeChange={pagination.onPageSizeChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          summary
        />
      </div>
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
