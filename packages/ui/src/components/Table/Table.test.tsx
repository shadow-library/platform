/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Table } from './Table';
import { type TableColumn } from './Table.types';

/**
 * Declaring the constants
 */
interface Service {
  id: string;
  name: string;
  status: string;
  rpm: number;
}

const services: Service[] = [
  { id: 'a', name: 'checkout', status: 'Active', rpm: 1240 },
  { id: 'b', name: 'billing', status: 'Failed', rpm: 32 },
  { id: 'c', name: 'search', status: 'Active', rpm: 890 },
];

const columns: TableColumn<Service>[] = [
  { id: 'name', header: 'Service', sortable: true },
  { id: 'status', header: 'Status' },
  { id: 'rpm', header: 'Requests / min', align: 'end' },
];

describe('Table', () => {
  it('renders a semantic table with headers and cells', () => {
    render(<Table data={services} columns={columns} rowKey="id" aria-label="Services" />);
    expect(screen.getByRole('table', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Service/ })).toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
    expect(screen.getByText('1240')).toBeInTheDocument();
  });

  it('cycles a sortable header asc → desc → none', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const { rerender } = render(<Table data={services} columns={columns} rowKey="id" sort={null} onSortChange={onSortChange} aria-label="Services" />);
    const header = screen.getByRole('button', { name: /Service/ });
    await user.click(header);
    expect(onSortChange).toHaveBeenLastCalledWith({ id: 'name', direction: 'asc' });
    rerender(<Table data={services} columns={columns} rowKey="id" sort={{ id: 'name', direction: 'asc' }} onSortChange={onSortChange} aria-label="Services" />);
    expect(screen.getByRole('columnheader', { name: /Service/ })).toHaveAttribute('aria-sort', 'ascending');
    await user.click(header);
    expect(onSortChange).toHaveBeenLastCalledWith({ id: 'name', direction: 'desc' });
    rerender(<Table data={services} columns={columns} rowKey="id" sort={{ id: 'name', direction: 'desc' }} onSortChange={onSortChange} aria-label="Services" />);
    await user.click(header);
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  it('selects all rows through the header checkbox', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(<Table data={services} columns={columns} rowKey="id" selection={[]} onSelectionChange={onSelectionChange} aria-label="Services" />);
    await user.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(onSelectionChange).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('keeps row selection separate from row navigation', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onRowClick = vi.fn();
    render(<Table data={services} columns={columns} rowKey="id" selection={[]} onSelectionChange={onSelectionChange} onRowClick={onRowClick} aria-label="Services" />);
    await user.click(screen.getByRole('checkbox', { name: 'Select a' }));
    expect(onSelectionChange).toHaveBeenCalledWith(['a']);
    expect(onRowClick).not.toHaveBeenCalled();
    await user.click(screen.getByText('checkout'));
    expect(onRowClick).toHaveBeenCalledWith(services[0]);
  });

  it('shows the bulk bar with a live count while selecting', () => {
    render(
      <Table
        data={services}
        columns={columns}
        rowKey="id"
        selection={['a', 'b']}
        onSelectionChange={() => {}}
        bulkActions={<button type="button">Archive</button>}
        aria-label="Services"
      />,
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    render(<Table data={services} columns={columns} rowKey="id" loading aria-label="Services" />);
    expect(screen.queryByText('checkout')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', () => {
    render(<Table data={[]} columns={columns} rowKey="id" emptyState="No services yet" aria-label="Services" />);
    expect(screen.getByText('No services yet')).toBeInTheDocument();
  });
});
