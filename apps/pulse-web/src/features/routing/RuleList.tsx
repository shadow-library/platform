import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Button, Input, Pagination, Select, Table, type TableColumn } from '@shadow-library/ui';
import { useSearchParams } from '@shadow-library/web/router';

import {
  ALL,
  AnyOrValue,
  formatDateTime,
  FormDrawer,
  type FormValues,
  MESSAGE_TYPE_FILTER_OPTIONS,
  Muted,
  type Option,
  OutlineBadge,
  PAGE_SIZE_OPTIONS,
  PageHeader,
  trimToUndefined,
  useConfirm,
  useDebouncedParam,
  useTablePagination,
  useTableSort,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import {
  type MessageType,
  useCreateSenderRoutingRuleMutation,
  useDeleteSenderRoutingRuleMutation,
  useListSenderProfilesQuery,
  useListSenderRoutingRulesQuery,
  useUpdateSenderRoutingRuleMutation,
} from '@/lib';
import { type RoutingRule, ruleFormConfig } from './forms';
import styles from './Routing.module.css';
import RuleDrawer from './RuleDrawer';

const rowKey = (rule: RoutingRule): string => `${rule.senderProfileId}:${rule.messageType ?? ''}:${rule.region ?? ''}:${rule.service ?? ''}:${rule.createdAt}`;

export default function RuleList(): ReactElement {
  const { search, appendSearch } = useSearchParams();
  const { data, isLoading } = useListSenderRoutingRulesQuery(search);
  const rules: RoutingRule[] = data?.items ?? [];
  const [regionValue, setRegionValue] = useDebouncedParam('region');
  const [serviceValue, setServiceValue] = useDebouncedParam('serviceName');
  const pagination = useTablePagination(data?.total);
  const { sort, onSortChange } = useTableSort({ id: 'updatedAt', direction: 'desc' });
  const confirm = useConfirm();

  const { data: profilesData } = useListSenderProfilesQuery({ limit: 100 });
  const profiles = useMemo(() => profilesData?.items ?? [], [profilesData]);
  const profileById = useMemo(() => new Map(profiles.map(profile => [profile.id, profile])), [profiles]);
  const senderOptions: Option[] = profiles.map(profile => ({ value: profile.id, label: profile.displayName ? `${profile.key} — ${profile.displayName}` : profile.key }));

  const [viewing, setViewing] = useState<RoutingRule | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; row: RoutingRule | null }>({ open: false, row: null });
  const createMutation = useCreateSenderRoutingRuleMutation();
  const updateMutation = useUpdateSenderRoutingRuleMutation(editing.row?.id ?? '');
  const config = ruleFormConfig(editing.row, senderOptions);
  const closeForm = (): void => setEditing(prev => ({ ...prev, open: false }));

  const [deleting, setDeleting] = useState<RoutingRule | null>(null);
  const deleteMutation = useDeleteSenderRoutingRuleMutation(deleting?.id ?? '');
  useEffect(() => {
    if (!deleting) return;
    deleteMutation.mutate(undefined, { onSettled: () => setDeleting(null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting]);

  const submit = (values: FormValues): void => {
    const senderProfileId = String(values.senderProfileId ?? '');
    if (editing.row) {
      updateMutation.mutate({ senderProfileId }, { onSuccess: closeForm });
    } else {
      const messageType = values.messageType === 'NONE' ? undefined : (values.messageType as MessageType | undefined);
      createMutation.mutate({ senderProfileId, messageType, region: trimToUndefined(values.region), service: trimToUndefined(values.service) }, { onSuccess: closeForm });
    }
  };

  const requestDelete = async (row: RoutingRule): Promise<void> => {
    if (await confirm({ title: 'Delete routing rule?', description: 'This routing rule will be permanently removed.' })) setDeleting(row);
  };

  const columns: TableColumn<RoutingRule>[] = [
    {
      id: 'senderProfileId',
      header: 'Sender profile',
      cell: row => {
        const profile = profileById.get(row.senderProfileId);
        if (!profile) return <span className={controls.danger}>unlinked</span>;
        return (
          <div className={styles.senderCell}>
            <span className={styles.senderKey}>{profile.key}</span>
            {profile.displayName ? <span className={styles.senderName}>{profile.displayName}</span> : null}
          </div>
        );
      },
    },
    { id: 'messageType', header: 'Type', cell: row => (row.messageType ? <OutlineBadge>{row.messageType}</OutlineBadge> : <AnyOrValue />) },
    { id: 'region', header: 'Region', cell: row => <AnyOrValue value={row.region} /> },
    { id: 'service', header: 'Service', cell: row => <AnyOrValue value={row.service} /> },
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
            Re-point
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
        title="Routing Rules"
        subtitle="Decide which sender profile handles a notification by type, region and service."
        action={
          <Button variant="primary" onClick={() => setEditing({ open: true, row: null })}>
            New routing rule
          </Button>
        }
      />
      <div className={controls.toolbar}>
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
        <Input className={controls.filter} value={regionValue} onValueChange={setRegionValue} placeholder="Region" clearable />
        <Input className={controls.filter} value={serviceValue} onValueChange={setServiceValue} placeholder="Service" clearable />
      </div>
      <Table
        data={rules}
        columns={columns}
        rowKey={rowKey}
        aria-label="Routing rules"
        loading={isLoading}
        onRowClick={setViewing}
        sort={sort}
        onSortChange={onSortChange}
        emptyState="No routing rules match your filters."
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

      <RuleDrawer rule={viewing} profile={viewing ? profileById.get(viewing.senderProfileId) : undefined} onOpenChange={open => !open && setViewing(null)} />
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
