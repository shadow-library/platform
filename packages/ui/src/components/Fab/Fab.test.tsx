/**
 * Importing npm packages
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

function tokenValue(css: string, name: string): number {
  const match = css.match(new RegExp(`${name}:\\s*(-?\\d+)`));
  if (!match?.[1]) throw new Error(`token ${name} not found in tokens.css`);
  return Number(match[1]);
}

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

  it('should keep the FAB above shell-pinned chrome and below every overlay layer', () => {
    const fabCss = readFileSync(path.join(import.meta.dirname, 'Fab.module.css'), 'utf-8');
    const tokensCss = readFileSync(path.join(import.meta.dirname, '../../styles/tokens.css'), 'utf-8');

    const rootRule = fabCss.slice(fabCss.indexOf('.root {'));
    const zIndexOffset = rootRule.match(/z-index:\s*calc\(var\(--sh-z-shell\)\s*\+\s*(\d+)\)/);
    expect(zIndexOffset?.[1]).toBeDefined();

    const shellZ = tokenValue(tokensCss, '--sh-z-shell');
    const dropdownZ = tokenValue(tokensCss, '--sh-z-dropdown');
    const fabZ = shellZ + Number(zIndexOffset?.[1]);

    // BottomNavigation is z-shell; Popover/Select/DropdownMenu/DatePicker/… start at z-dropdown. The FAB
    // sits in the same bottom-right corner as either, so it must clear the first and stay under the second.
    expect(fabZ).toBeGreaterThan(shellZ);
    expect(fabZ).toBeLessThan(dropdownZ);
  });

  it('should honour a fixed Fab placement', () => {
    render(<Fab icon={icon} aria-label="Compose" placement="fixed" style={{ right: 16, bottom: 76 }} className="app-fab" />);
    const button = screen.getByRole('button', { name: 'Compose' });
    expect(button).toHaveAttribute('data-placement', 'fixed');
    expect(button).toHaveClass('app-fab');
    expect(button).toHaveStyle({ right: '16px', bottom: '76px' });
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
