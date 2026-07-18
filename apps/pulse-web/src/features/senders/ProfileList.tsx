/**
 * Importing npm packages
 */
import { Button, Input, Pagination, Select, Table, type TableColumn } from '@shadow-library/ui';
import { useSearchParams } from '@shadow-library/ui/router';
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import {
  ACTIVE_FILTER_OPTIONS,
  ALL,
  FormDrawer,
  type FormValues,
  Mono,
  Muted,
  PAGE_SIZE_OPTIONS,
  PageHeader,
  SearchIcon,
  StatusBadge,
  TextOrDash,
  formatDateTime,
  trimToUndefined,
  useConfirm,
  useDebouncedParam,
  useTablePagination,
  useTableSort,
} from '@/features/shared';
import { type SenderProfileResponse, useCreateSenderProfileMutation, useDeleteSenderProfileMutation, useListSenderProfilesQuery, useUpdateSenderProfileMutation } from '@/lib';

import { senderFormConfig } from './forms';

import controls from '@/features/shared/controls.module.css';

export default function ProfileList(): ReactElement {
  const navigate = useNavigate();
  const { search, appendSearch } = useSearchParams();
  const { data, isLoading } = useListSenderProfilesQuery(search);
  const [searchValue, setSearchValue] = useDebouncedParam('key');
  const pagination = useTablePagination(data?.total);
  const { sort, onSortChange } = useTableSort({ id: 'updatedAt', direction: 'desc' });
  const confirm = useConfirm();

  const [editing, setEditing] = useState<{ open: boolean; row: SenderProfileResponse | null }>({ open: false, row: null });
  const createMutation = useCreateSenderProfileMutation();
  const updateMutation = useUpdateSenderProfileMutation(editing.row?.id ?? '');
  const config = senderFormConfig(editing.row);
  const closeForm = (): void => setEditing(prev => ({ ...prev, open: false }));

  const [deleting, setDeleting] = useState<SenderProfileResponse | null>(null);
  const deleteMutation = useDeleteSenderProfileMutation(deleting?.id ?? '');
  useEffect(() => {
    if (!deleting) return;
    deleteMutation.mutate(undefined, { onSettled: () => setDeleting(null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting]);

  const submit = (values: FormValues): void => {
    const displayName = trimToUndefined(values.displayName);
    const isActive = values.isActive !== false;
    if (editing.row) updateMutation.mutate({ displayName, isActive }, { onSuccess: closeForm });
    else createMutation.mutate({ key: String(values.key ?? '').trim(), displayName, isActive }, { onSuccess: closeForm });
  };

  const requestDelete = async (row: SenderProfileResponse): Promise<void> => {
    if (await confirm({ title: 'Delete sender profile?', description: `Deleting "${row.key}" also removes its endpoints and unlinks routing rules.` })) setDeleting(row);
  };

  const columns: TableColumn<SenderProfileResponse>[] = [
    { id: 'key', header: 'Key', cell: row => <Mono>{row.key}</Mono> },
    { id: 'displayName', header: 'Display name', cell: row => <TextOrDash value={row.displayName} /> },
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
          <Button
            variant="ghost"
            size="sm"
            className={controls.danger}
            onClick={event => {
              event.stopPropagation();
              void requestDelete(row);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sender Profiles"
        subtitle="Named groupings of provider endpoints selectable for routing."
        action={
          <Button variant="primary" onClick={() => setEditing({ open: true, row: null })}>
            New sender profile
          </Button>
        }
      />
      <div className={controls.toolbar}>
        <Input className={controls.search} value={searchValue} onValueChange={setSearchValue} placeholder="Search by key" prefix={<SearchIcon />} clearable />
        <Select className={controls.filter} value={search.isActive ?? ALL} onValueChange={value => appendSearch({ isActive: value === ALL ? '' : value, offset: 0 })} aria-label="Filter by status">
          {ACTIVE_FILTER_OPTIONS.map(option => (
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
        aria-label="Sender profiles"
        loading={isLoading}
        onRowClick={row => navigate({ to: '/senders/$profileId', params: { profileId: row.id } })}
        sort={sort}
        onSortChange={onSortChange}
        emptyState="No sender profiles match your filters."
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
