/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { ContextMenu } from './ContextMenu';

/**
 * Declaring the constants
 */
function Files({ onOpen = () => {} }: { onOpen?: () => void }) {
  return (
    <ContextMenu>
      <ContextMenu.Trigger>
        <div style={{ width: 200, height: 120 }}>Right-click target</div>
      </ContextMenu.Trigger>
      <ContextMenu.Content aria-label='File actions'>
        <ContextMenu.Item shortcut='⌘O' onSelect={onOpen}>
          Open
        </ContextMenu.Item>
        <ContextMenu.Item>Copy</ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item destructive shortcut='⌘⌫'>
          Delete
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  );
}

async function rightClick(element: Element): Promise<void> {
  const user = userEvent.setup();
  await user.pointer({ keys: '[MouseRight]', target: element });
}

describe('ContextMenu', () => {
  it('opens a menu at the pointer on right-click with menu-pattern roles', async () => {
    render(<Files />);
    await rightClick(screen.getByText('Right-click target'));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Open/ })).toBeInTheDocument();
  });

  it('invokes the selected item', async () => {
    const onOpen = vi.fn();
    render(<Files onOpen={onOpen} />);
    await rightClick(screen.getByText('Right-click target'));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('menuitem', { name: /Open/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('marks destructive items for isolation', async () => {
    render(<Files />);
    await rightClick(screen.getByText('Right-click target'));
    expect(await screen.findByRole('menuitem', { name: /Delete/ })).toHaveAttribute('data-destructive');
  });
});
