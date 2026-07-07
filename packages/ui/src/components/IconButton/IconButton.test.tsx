/**
 * Importing npm packages
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { IconButton } from './IconButton';

/**
 * Declaring the constants
 */
const Icon = () => <svg data-testid='icon' viewBox='0 0 16 16' aria-hidden='true' />;

describe('IconButton', () => {
  it('uses aria-label as the accessible name and renders the icon', () => {
    render(<IconButton icon={<Icon />} aria-label='Add' />);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(within(button).getByTestId('icon')).toBeInTheDocument();
  });

  it('defaults to the ghost variant and md size', () => {
    render(<IconButton icon={<Icon />} aria-label='Add' />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it('reflects variant and size as data attributes', () => {
    render(<IconButton icon={<Icon />} aria-label='Add' variant='primary' size='lg' />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'lg');
  });

  it('mirrors aria-label into a native title tooltip by default', () => {
    render(<IconButton icon={<Icon />} aria-label='Search' />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Search');
  });

  it('throws in development when aria-label is empty', () => {
    const emptyLabel = { 'aria-label': '' };
    expect(() => render(<IconButton icon={<Icon />} {...emptyLabel} />)).toThrow(/aria-label/);
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton icon={<Icon />} aria-label='Add' onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton icon={<Icon />} aria-label='Add' disabled onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('replaces the icon with a spinner and blocks clicks while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton icon={<Icon />} aria-label='Saving' loading onClick={onClick} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(within(button).queryByTestId('icon')).not.toBeInTheDocument();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('exposes toggle state via aria-pressed and data-pressed', () => {
    const { rerender } = render(<IconButton icon={<Icon />} aria-label='Pin' pressed={false} />);
    const button = screen.getByRole('button', { pressed: false });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('data-pressed');
    rerender(<IconButton icon={<Icon />} aria-label='Pin' pressed />);
    expect(screen.getByRole('button', { pressed: true })).toHaveAttribute('data-pressed', 'true');
  });

  it('omits aria-pressed when pressed is undefined', () => {
    render(<IconButton icon={<Icon />} aria-label='Add' />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
  });

  it('forwards the ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<IconButton ref={ref} icon={<Icon />} aria-label='Add' />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('renders as the child element with asChild, injecting the icon and aria-label', () => {
    render(
      <IconButton asChild icon={<Icon />} aria-label='Home'>
        {/* biome-ignore lint/a11y/useAnchorContent: the icon is injected into the anchor via Slot */}
        <a href='/home' />
      </IconButton>,
    );
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link).toHaveAttribute('href', '/home');
    expect(within(link).getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
