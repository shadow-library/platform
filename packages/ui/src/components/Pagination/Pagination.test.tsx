/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Pagination } from './Pagination';

/**
 * Declaring the constants
 */

describe('Pagination', () => {
  it('renders a labelled nav with a range summary and the current page marked', () => {
    render(<Pagination page={4} total={3204} pageSize={50} onPageChange={() => {}} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByText('Showing 151 to 200 of 3,204')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 4' })).toHaveAttribute('aria-current', 'page');
  });

  it('windows pages with ellipses and always shows first and last', () => {
    render(<Pagination page={8} total={3250} pageSize={50} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 65' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 8' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 30' })).not.toBeInTheDocument();
  });

  it('changes page via number and arrow buttons', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={4} total={3204} pageSize={50} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Page 5' }));
    expect(onPageChange).toHaveBeenLastCalledWith(5);
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });

  it('disables Prev on the first page and Next on the last', () => {
    const { rerender } = render(<Pagination page={1} total={200} pageSize={50} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    rerender(<Pagination page={4} total={200} pageSize={50} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('renders only Prev/Next in cursor mode', () => {
    render(<Pagination hasPrev hasNext={false} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Page/ })).not.toBeInTheDocument();
  });

  it('hides itself with a single page and no page-size control', () => {
    const { container } = render(<Pagination page={1} total={30} pageSize={50} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
