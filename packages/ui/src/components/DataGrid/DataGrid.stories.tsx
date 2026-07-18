/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Badge } from '../Badge';
import { DataGrid } from './DataGrid';
import { type GridColumn } from './DataGrid.types';

/**
 * Declaring the constants
 */
interface Service {
  id: string;
  name: string;
  replicas: number;
  status: string;
}

const initial: Service[] = [
  { id: '1', name: 'checkout-service', replicas: 3, status: 'Active' },
  { id: '2', name: 'billing-service', replicas: 1, status: 'Failed' },
  { id: '3', name: 'search-service', replicas: 2, status: 'Active' },
  { id: '4', name: 'auth-service', replicas: 4, status: 'Degraded' },
];

const columns: GridColumn<Service>[] = [
  { id: 'name', header: 'Service', sortable: true, editable: true, width: 220 },
  { id: 'replicas', header: 'Replicas', align: 'end', sortable: true, editable: true, width: 120 },
  {
    id: 'status',
    header: 'Status',
    sortable: true,
    width: 140,
    cell: row => (
      <Badge intent={row.status === 'Active' ? 'success' : row.status === 'Failed' ? 'danger' : 'warning'} dot>
        {row.status}
      </Badge>
    ),
  },
];

const meta = {
  title: 'Components/DataGrid',
  component: DataGrid,
  parameters: { layout: 'padded' },
  args: { data: initial, columns, rowKey: 'id', 'aria-label': 'Services' },
} satisfies Meta<typeof DataGrid<Service>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Editable: Story = {
  render: () => {
    const [data, setData] = useState(initial);
    return (
      <DataGrid
        data={data}
        columns={columns}
        rowKey="id"
        aria-label="Services"
        onCellEdit={(rowKey, columnId, value) =>
          setData(rows => rows.map(row => (row.id === rowKey ? { ...row, [columnId]: columnId === 'replicas' ? Number(value) : value } : row)))
        }
      />
    );
  },
};
