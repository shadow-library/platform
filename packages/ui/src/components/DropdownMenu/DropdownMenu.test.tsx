/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { DropdownMenu } from './DropdownMenu';

/**
 * Declaring the constants
 */
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function Menu({ onDuplicate }: { onDuplicate?: () => void } = {}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button>Actions</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item shortcut='⌘D' onSelect={onDuplicate}>
          Duplicate
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled>Rename</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item destructive>Delete run…</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('exposes the trigger with menu haspopup and opens on click', async () => {
    const user = userEvent.setup();
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Duplicate/ })).toBeInTheDocument();
  });

  it('runs the action and closes on select', async () => {
    const onDuplicate = vi.fn();
    const user = userEvent.setup();
    render(<Menu onDuplicate={onDuplicate} />);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Duplicate/ }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('marks disabled and destructive items', async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: /Delete run/ })).toHaveAttribute('data-destructive', 'true');
  });

  it('keeps the menu open when toggling a checkbox item', async () => {
    function WithCheckbox() {
      const [compact, setCompact] = useState(false);
      return (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button>View</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.CheckboxItem checked={compact} onCheckedChange={setCompact}>
              Compact rows
            </DropdownMenu.CheckboxItem>
          </DropdownMenu.Content>
        </DropdownMenu>
      );
    }
    const user = userEvent.setup();
    render(<WithCheckbox />);
    await user.click(screen.getByRole('button', { name: 'View' }));
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Compact rows' });
    expect(item).toHaveAttribute('aria-checked', 'false');
    await user.click(item);
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Compact rows' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('selects a radio item and keeps the menu open', async () => {
    function WithRadio() {
      const [sort, setSort] = useState('name');
      return (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button>Sort</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.RadioGroup value={sort} onValueChange={setSort}>
              <DropdownMenu.RadioItem value='name'>Name</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value='date'>Date</DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu>
      );
    }
    const user = userEvent.setup();
    render(<WithRadio />);
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Date' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Date' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
