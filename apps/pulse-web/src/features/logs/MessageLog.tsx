/**
 * Importing npm packages
 */
import { type ReactElement, useState } from 'react';
import { Badge, Card, EmptyState, Input, Pagination, Select, Table, type TableColumn } from '@shadow-library/ui';
import { useSearchParams } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import {
  ALL,
  CHANNEL_FILTER_OPTIONS,
  formatDateTime,
  Mono,
  Muted,
  OutlineBadge,
  PAGE_SIZE_OPTIONS,
  PageHeader,
  SearchIcon,
  useDebouncedParam,
  useTablePagination,
  useTableSort,
  type ViewerData,
  ViewerDrawer,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type NotificationMessageResponse, useListNotificationMessagesQuery } from '@/lib';

export default function MessageLog(): ReactElement {
  const header = (
    <PageHeader
      title={
        <>
          Message Log <Badge variant="outline">dev-only</Badge>
        </>
      }
      subtitle="Inspect previously rendered / sent messages. Available only when the server runs in the dev environment stage."
    />
  );

  if (!import.meta.env.DEV) {
    return (
      <>
        {header}
        <Card padding="sm">
          <EmptyState
            title="Message Log is unavailable"
            description="This inspection endpoint is only exposed while the server runs in the dev environment stage. Run the server in dev to view rendered messages."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <MessageLogTable />
    </>
  );
}

function MessageLogTable(): ReactElement {
  const { search, appendSearch } = useSearchParams();
  const { data, isLoading } = useListNotificationMessagesQuery(search);
  const [recipientValue, setRecipientValue] = useDebouncedParam('recipient');
  const pagination = useTablePagination(data?.total);
  const { sort, onSortChange } = useTableSort({ id: 'createdAt', direction: 'desc' });

  const [viewer, setViewer] = useState<ViewerData | null>(null);
  const openView = (row: NotificationMessageResponse): void =>
    setViewer({
      channel: row.channel,
      title: `${row.channel} · ${row.recipient}`,
      meta: `${row.templateKey} · ${formatDateTime(row.createdAt)}`,
      recipient: row.recipient,
      subject: row.renderedSubject,
      body: row.renderedBody,
      rawBody: row.renderedBody,
      payload: row.payload ?? null,
    });

  const columns: TableColumn<NotificationMessageResponse>[] = [
    { id: 'channel', header: 'Channel', cell: row => <OutlineBadge>{row.channel}</OutlineBadge> },
    { id: 'recipient', header: 'Recipient', cell: row => <Mono>{row.recipient}</Mono> },
    { id: 'locale', header: 'Locale', cell: row => <Mono>{row.locale}</Mono> },
    { id: 'templateKey', header: 'Template', cell: row => <Mono>{row.templateKey}</Mono> },
    { id: 'messageType', header: 'Type', cell: row => <OutlineBadge>{row.messageType}</OutlineBadge> },
    { id: 'createdAt', header: 'Created', sortable: true, cell: row => <Muted>{formatDateTime(row.createdAt)}</Muted> },
  ];

  return (
    <>
      <div className={controls.toolbar}>
        <Select
          className={controls.filter}
          value={search.channel ?? ALL}
          onValueChange={value => appendSearch({ channel: value === ALL ? '' : value, offset: 0 })}
          aria-label="Filter by channel"
        >
          {CHANNEL_FILTER_OPTIONS.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
        <Input className={controls.searchNarrow} value={recipientValue} onValueChange={setRecipientValue} placeholder="Filter by recipient" prefix={<SearchIcon />} clearable />
      </div>
      <Table
        data={data?.items ?? []}
        columns={columns}
        rowKey="id"
        aria-label="Message log"
        loading={isLoading}
        onRowClick={openView}
        sort={sort}
        onSortChange={onSortChange}
        emptyState="No messages match your filters."
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
      <ViewerDrawer open={!!viewer} data={viewer} onOpenChange={open => !open && setViewer(null)} />
    </>
  );
}
