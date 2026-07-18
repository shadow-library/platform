/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Fab } from './Fab';

/**
 * Declaring the constants
 */
const icon = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
);

describe('Fab', () => {
  it('renders an icon-only button named by aria-label', () => {
    render(<Fab icon={icon} aria-label="Compose" />);
    const button = screen.getByRole('button', { name: 'Compose' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'md');
    expect(button).toHaveAttribute('data-placement', 'bottom-end');
    expect(button).not.toHaveAttribute('data-extended');
  });

  it('extends into a pill when a label is provided and hides the icon from the tree', () => {
    render(<Fab icon={icon} label="Compose" />);
    const button = screen.getByRole('button', { name: 'Compose' });
    expect(button).toHaveAttribute('data-extended');
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('reflects variant, size, and placement as data attributes', () => {
    render(<Fab icon={icon} aria-label="Add" variant="secondary" size="lg" placement="bottom-center" />);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'lg');
    expect(button).toHaveAttribute('data-placement', 'bottom-center');
  });

  it('fires onClick and supports keyboard activation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Fab icon={icon} aria-label="Compose" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Compose' });
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('blocks activation when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Fab icon={icon} aria-label="Compose" disabled onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders the child element with asChild', () => {
    render(
      <Fab asChild icon={icon} aria-label="Compose">
        <a href="/compose">
          <svg viewBox="0 0 16 16" aria-hidden="true" />
        </a>
      </Fab>,
    );
    const link = screen.getByRole('link', { name: 'Compose' });
    expect(link).toHaveAttribute('href', '/compose');
    expect(link).toHaveAttribute('data-placement', 'bottom-end');
  });
});
