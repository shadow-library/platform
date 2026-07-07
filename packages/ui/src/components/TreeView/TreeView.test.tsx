/**
 * Importing npm packages
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { TreeView } from './TreeView';
import { type TreeNode } from './TreeView.types';

/**
 * Declaring the constants
 */
const tree: TreeNode[] = [
  {
    id: 'eng',
    label: 'Engineering',
    children: [
      { id: 'platform', label: 'Platform' },
      { id: 'billing', label: 'Billing' },
    ],
  },
  { id: 'design', label: 'Design' },
];

describe('TreeView', () => {
  it('renders the ARIA tree with levels and expand state', () => {
    render(<TreeView nodes={tree} defaultExpanded={['eng']} aria-label='Org' />);
    expect(screen.getByRole('tree', { name: 'Org' })).toBeInTheDocument();
    const eng = screen.getByRole('treeitem', { name: /Engineering/ });
    expect(eng).toHaveAttribute('aria-level', '1');
    expect(eng).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: 'Platform' })).toHaveAttribute('aria-level', '2');
  });

  it('collapses children when the branch is not expanded', () => {
    render(<TreeView nodes={tree} aria-label='Org' />);
    expect(screen.queryByRole('treeitem', { name: 'Platform' })).not.toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /Engineering/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands a branch with ArrowRight', async () => {
    const user = userEvent.setup();
    render(<TreeView nodes={tree} aria-label='Org' />);
    screen.getByRole('treeitem', { name: /Engineering/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: /Engineering/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: 'Platform' })).toBeInTheDocument();
  });

  it('selects a node on click', async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    render(<TreeView nodes={tree} defaultExpanded={['eng']} onSelectedChange={onSelectedChange} aria-label='Org' />);
    await user.click(screen.getByText('Billing'));
    expect(onSelectedChange).toHaveBeenLastCalledWith(['billing']);
    expect(screen.getByRole('treeitem', { name: 'Billing' })).toHaveAttribute('aria-selected', 'true');
  });

  it('aggregates checkbox state tri-state on parents', () => {
    const onSelectedChange = vi.fn();
    render(<TreeView nodes={tree} checkboxes defaultExpanded={['eng']} onSelectedChange={onSelectedChange} aria-label='Org' />);
    const platformCheck = screen.getByRole('treeitem', { name: 'Platform' }).querySelector('[data-tree-check]');
    if (platformCheck) fireEvent.click(platformCheck);
    expect(onSelectedChange).toHaveBeenLastCalledWith(['platform']);
    expect(screen.getByRole('treeitem', { name: /Engineering/ })).toHaveAttribute('aria-checked', 'mixed');
  });

  it('checking a parent cascades to all its leaves', () => {
    const onSelectedChange = vi.fn();
    render(<TreeView nodes={tree} checkboxes defaultExpanded={['eng']} onSelectedChange={onSelectedChange} aria-label='Org' />);
    const engCheck = screen.getByRole('treeitem', { name: /Engineering/ }).querySelector('[data-tree-check]');
    if (engCheck) fireEvent.click(engCheck);
    expect(onSelectedChange).toHaveBeenLastCalledWith(['platform', 'billing']);
  });
});
