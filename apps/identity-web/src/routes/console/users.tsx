/**
 * Importing npm packages
 */
import { Avatar, Input, Pagination, Select, Table } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { SearchIcon } from '@/components/icons';
import { PageHeader, StatusChip } from '@/components/si';
import { type UserStatus, type UserSummaryItem, useUsersQuery } from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from './console.module.css';

export const Route = createFileRoute('/console/users')({
  component: UsersPage,
});

const PAGE_SIZE = 25;

export function userStatusChip(user: Pick<UserSummaryItem, 'status' | 'lockMode'>): React.JSX.Element {
  if (user.lockMode !== 'NONE')
    return (
      <StatusChip intent="danger" dot>
        Locked
      </StatusChip>
    );
  const intent = user.status === 'ACTIVE' ? 'success' : user.status === 'BLOCKED' ? 'danger' : user.status === 'SUSPENDED' || user.status === 'DISABLED' ? 'warning' : 'neutral';
  return (
    <StatusChip intent={intent} dot>
      {user.status[0] + user.status.slice(1).toLowerCase()}
    </StatusChip>
  );
}

function UsersPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);

  const users = useUsersQuery({ email: search || undefined, status: status === 'all' ? undefined : (status as UserStatus), offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
  const data = users.data;
  const rows = data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader title="Users" subtitle={data ? `${data.total.toLocaleString()} accounts across the platform.` : 'Platform user directory.'} />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input
            size="sm"
            placeholder="Search by email…"
            prefix={<SearchIcon size={15} />}
            value={search}
            onValueChange={value => {
              setSearch(value);
              setPage(1);
            }}
          />
        </div>
        <Select
          size="sm"
          value={status}
          onValueChange={value => {
            setStatus(value);
            setPage(1);
          }}
        >
          <Select.Item value="all">All statuses</Select.Item>
          <Select.Item value="ACTIVE">Active</Select.Item>
          <Select.Item value="SUSPENDED">Suspended</Select.Item>
          <Select.Item value="DISABLED">Disabled</Select.Item>
          <Select.Item value="BLOCKED">Blocked</Select.Item>
          <Select.Item value="CLOSED">Closed</Select.Item>
        </Select>
      </div>

      <div className={styles.tableCard}>
        <Table
          data={rows}
          rowKey="id"
          loading={users.isLoading}
          aria-label="Users"
          onRowClick={user => navigate({ to: '/console/users/$userId', params: { userId: user.id } })}
          emptyState={<div style={{ padding: 32, textAlign: 'center', color: 'var(--sh-text-tertiary)' }}>No users match your search.</div>}
          columns={[
            {
              id: 'user',
              header: 'User',
              cell: user => (
                <div className={styles.cell}>
                  <Avatar name={user.primaryEmail ?? user.username ?? user.id} size="sm" />
                  <div className={styles.cellMain}>
                    <div className={styles.cellName}>{user.username ?? user.primaryEmail ?? `User ${user.id}`}</div>
                    <div className={styles.cellSub}>{user.primaryEmail}</div>
                  </div>
                </div>
              ),
            },
            { id: 'status', header: 'Status', cell: user => userStatusChip(user) },
            { id: 'created', header: 'Created', cell: user => <span className={styles.muted}>{formatDate(user.createdAt)}</span> },
          ]}
        />
        {data && data.total > PAGE_SIZE && (
          <div className={styles.tableFoot}>
            <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onPageChange={setPage} summary />
          </div>
        )}
      </div>
    </div>
  );
}
