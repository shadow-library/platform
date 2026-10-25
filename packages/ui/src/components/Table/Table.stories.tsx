import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Badge, type BadgeIntent } from '../Badge';
import { Button } from '../Button';
import { Table } from './Table';
import { type TableColumn, type TableSort } from './Table.types';

interface Service {
  id: string;
  name: string;
  status: string;
  intent: BadgeIntent;
  rpm: number;
  p95: string;
}

const services: Service[] = [
  { id: '1', name: 'checkout-service', status: 'Active', intent: 'success', rpm: 1240, p95: '42ms' },
  { id: '2', name: 'billing-service', status: 'Failed', intent: 'danger', rpm: 32, p95: '210ms' },
  { id: '3', name: 'search-service', status: 'Active', intent: 'success', rpm: 890, p95: '68ms' },
  { id: '4', name: 'auth-service', status: 'Degraded', intent: 'warning', rpm: 512, p95: '96ms' },
  { id: '5', name: 'notify-service', status: 'Active', intent: 'success', rpm: 77, p95: '31ms' },
];

const columns: TableColumn<Service>[] = [
  { id: 'name', header: 'Service', sortable: true },
  {
    id: 'status',
    header: 'Status',
    cell: row => (
      <Badge intent={row.intent} dot>
        {row.status}
      </Badge>
    ),
  },
  { id: 'rpm', header: 'Requests / min', align: 'end', sortable: true },
  { id: 'p95', header: 'P95', align: 'end' },
];

const meta = {
  title: 'Components/Table',
  component: Table,
  parameters: { layout: 'padded' },
  args: { data: services, columns, rowKey: 'id', 'aria-label': 'Services' },
} satisfies Meta<typeof Table<Service>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>(['2']);
    const [sort, setSort] = useState<TableSort | null>({ id: 'name', direction: 'asc' });
    return (
      <Table
        data={services}
        columns={columns}
        rowKey="id"
        aria-label="Services"
        selection={selected}
        onSelectionChange={setSelected}
        sort={sort}
        onSortChange={setSort}
        onRowClick={() => {}}
        bulkActions={
          <>
            <Button variant="secondary" size="sm">
              Export
            </Button>
            <Button variant="danger" size="sm">
              Archive…
            </Button>
          </>
        }
      />
    );
  },
};

export const Loading: Story = {
  render: () => <Table data={services} columns={columns} rowKey="id" aria-label="Services" loading />,
};

export const Empty: Story = {
  render: () => <Table data={[]} columns={columns} rowKey="id" aria-label="Services" emptyState="No services match your filters." />,
};

const wideColumns: TableColumn<Service>[] = [...columns, { id: 'owner', header: 'Owning team' }, { id: 'region', header: 'Primary region' }];

export const EmptyNarrow: Story = {
  name: 'Empty at 390px',
  globals: { viewport: { value: '390-844' } },
  render: () => <Table data={[]} columns={wideColumns} rowKey="id" aria-label="Services" emptyState="No calls in the last 30 days." />,
};
