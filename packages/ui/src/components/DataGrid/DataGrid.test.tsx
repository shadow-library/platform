/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { DataGrid } from './DataGrid';
import { type GridColumn } from './DataGrid.types';

/**
 * Declaring the constants
 */
interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: 'a', name: 'checkout', status: 'Active' },
  { id: 'b', name: 'billing', status: 'Failed' },
];

const columns: GridColumn<Row>[] = [
  { id: 'name', header: 'Service', sortable: true, editable: true },
  { id: 'status', header: 'Status', sortable: true },
];

describe('DataGrid', () => {
  it('renders the ARIA grid with true row/col counts', () => {
    render(<DataGrid data={rows} columns={columns} rowKey="id" aria-label="Services" />);
    const grid = screen.getByRole('grid', { name: 'Services' });
    expect(grid).toHaveAttribute('aria-rowcount', '3');
    expect(grid).toHaveAttribute('aria-colcount', '2');
    expect(screen.getAllByRole('cell')).toHaveLength(4);
    expect(screen.getByText('checkout')).toBeInTheDocument();
  });

  it('lays out one col per column so the table can fill its container', () => {
    // The grid fills its wrapper via .grid { width: 100% }; the fixed layout needs a <col> per column.
    // (Pixel width is a CSS concern jsdom can't measure — this guards the column template that fill depends on.)
    render(<DataGrid data={rows} columns={columns} rowKey="id" aria-label="Services" />);
    const table = screen.getByRole('grid', { name: 'Services' });
    expect(table.querySelectorAll('colgroup > col')).toHaveLength(columns.length);
    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length);
  });

  it('navigates cells with arrow keys', async () => {
    const user = userEvent.setup();
    render(<DataGrid data={rows} columns={columns} rowKey="id" aria-label="Services" />);
    const cells = screen.getAllByRole('cell');
    cells[0]?.focus();
    await user.keyboard('{ArrowRight}');
    expect(cells[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(cells[3]).toHaveFocus();
  });

  it('edits an editable cell and commits with Enter', async () => {
    const user = userEvent.setup();
    const onCellEdit = vi.fn();
    render(<DataGrid data={rows} columns={columns} rowKey="id" onCellEdit={onCellEdit} aria-label="Services" />);
    screen.getAllByRole('cell')[0]?.focus();
    await user.keyboard('{Enter}');
    const editor = screen.getByRole('textbox');
    await user.clear(editor);
    await user.type(editor, 'checkout-v2{Enter}');
    expect(onCellEdit).toHaveBeenCalledWith('a', 'name', 'checkout-v2');
  });

  it('reverts an edit with Escape', async () => {
    const user = userEvent.setup();
    const onCellEdit = vi.fn();
    render(<DataGrid data={rows} columns={columns} rowKey="id" onCellEdit={onCellEdit} aria-label="Services" />);
    screen.getAllByRole('cell')[0]?.focus();
    await user.keyboard('{Enter}');
    await user.type(screen.getByRole('textbox'), 'zzz');
    await user.keyboard('{Escape}');
    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('multi-sorts with shift-click and shows ordinals', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(<DataGrid data={rows} columns={columns} rowKey="id" onSortChange={onSortChange} aria-label="Services" />);
    await user.click(screen.getByRole('button', { name: /Service/ }));
    expect(onSortChange).toHaveBeenLastCalledWith([{ id: 'name', direction: 'asc' }]);
    expect(screen.getByRole('columnheader', { name: /Service/ })).toHaveAttribute('aria-sort', 'ascending');
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: /Status/ }));
    await user.keyboard('{/Shift}');
    expect(onSortChange).toHaveBeenLastCalledWith([
      { id: 'name', direction: 'asc' },
      { id: 'status', direction: 'asc' },
    ]);
  });
});
