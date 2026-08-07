import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Button, Input, Pagination, Select, Table, type TableColumn } from '@shadow-library/ui';
import { useSearchParams } from '@shadow-library/web/router';

import {
  ALL,
  formatDateTime,
  FormDrawer,
  type FormValues,
  MESSAGE_TYPE_FILTER_OPTIONS,
  Mono,
  Muted,
  OutlineBadge,
  PAGE_SIZE_OPTIONS,
  PageHeader,
  PriorityBadge,
  SearchIcon,
  StatusBadge,
  TextOrDash,
  trimToUndefined,
  useDebouncedParam,
  useTablePagination,
  useTableSort,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type MessageType, type Priority, type TemplateResponse, useCreateTemplateMutation, useListTemplatesQuery, useUpdateTemplateMutation } from '@/lib';

import { templateFormConfig } from './forms';

export default function TemplateList(): ReactElement {
  const navigate = useNavigate();
  const { search, appendSearch } = useSearchParams();
  const { data, isLoading } = useListTemplatesQuery(search);
  const [searchValue, setSearchValue] = useDebouncedParam('key');
  const pagination = useTablePagination(data?.total);
  const { sort, onSortChange } = useTableSort({ id: 'updatedAt', direction: 'desc' });

  const [editing, setEditing] = useState<{ open: boolean; row: TemplateResponse | null }>({ open: false, row: null });
  const createMutation = useCreateTemplateMutation();
  const updateMutation = useUpdateTemplateMutation(editing.row?.id ?? '');
  const config = templateFormConfig(editing.row);

  const closeForm = (): void => setEditing(prev => ({ ...prev, open: false }));

  const submit = (values: FormValues): void => {
    const name = String(values.name ?? '').trim();
    const messageType = values.messageType as MessageType;
    const priority = values.priority as Priority;
    const category = trimToUndefined(values.category);
    const description = trimToUndefined(values.description);
    const isActive = values.isActive !== false;
    if (editing.row) updateMutation.mutate({ name, messageType, priority, category, description, isActive }, { onSuccess: closeForm });
    else createMutation.mutate({ templateKey: String(values.templateKey ?? '').trim(), name, messageType, priority, category, description, isActive }, { onSuccess: closeForm });
  };

  const columns: TableColumn<TemplateResponse>[] = [
    { id: 'templateKey', header: 'Template key', cell: row => <Mono>{row.templateKey}</Mono> },
    { id: 'name', header: 'Name', cell: row => <TextOrDash value={row.name} /> },
    { id: 'messageType', header: 'Type', cell: row => <OutlineBadge>{row.messageType}</OutlineBadge> },
    { id: 'priority', header: 'Priority', cell: row => <PriorityBadge priority={row.priority} /> },
    { id: 'isActive', header: 'Status', cell: row => <StatusBadge active={row.isActive} /> },
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
        title="Templates"
        subtitle="Versioned notification templates, each identified by a unique key."
        action={
          <Button variant="primary" onClick={() => setEditing({ open: true, row: null })}>
            New template
          </Button>
        }
      />
      <div className={controls.toolbar}>
        <Input className={controls.searchWide} value={searchValue} onValueChange={setSearchValue} placeholder="Search by template key" prefix={<SearchIcon />} clearable />
        <Select
          className={controls.filter}
          value={search.messageType ?? ALL}
          onValueChange={value => appendSearch({ messageType: value === ALL ? '' : value, offset: 0 })}
          aria-label="Filter by type"
        >
          {MESSAGE_TYPE_FILTER_OPTIONS.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
      </div>
      <Table
        data={data?.items ?? []}
        columns={columns}
        rowKey="id"
        aria-label="Templates"
        loading={isLoading}
        onRowClick={row => navigate({ to: '/templates/$templateId', params: { templateId: row.id } })}
        sort={sort}
        onSortChange={onSortChange}
        emptyState="No templates match your search."
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
