/**
 * Importing npm packages
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { SwipeActions } from './SwipeActions';

/**
 * Declaring the constants
 */
// happy-dom has no pointer-capture implementation; the component calls these on every swipe.
beforeAll(() => {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

function renderRow(props: Partial<Parameters<typeof SwipeActions>[0]> = {}) {
  return render(
    <SwipeActions
      data-testid="row"
      trailing={
        <>
          <SwipeActions.Action intent="neutral">Archive</SwipeActions.Action>
          <SwipeActions.Action intent="danger">Delete</SwipeActions.Action>
        </>
      }
      {...props}
    >
      <p>Weekly report</p>
    </SwipeActions>,
  );
}

function swipe(node: HTMLElement, fromX: number, toX: number): void {
  fireEvent.pointerDown(node, { pointerId: 1, clientX: fromX, clientY: 10, button: 0 });
  fireEvent.pointerMove(node, { pointerId: 1, clientX: fromX - 10, clientY: 10 });
  fireEvent.pointerMove(node, { pointerId: 1, clientX: toX, clientY: 10 });
  fireEvent.pointerUp(node, { pointerId: 1, clientX: toX, clientY: 10 });
}

describe('SwipeActions', () => {
  it('renders the row content and keeps a closed rail out of the accessibility tree', () => {
    renderRow();
    expect(screen.getByText('Weekly report')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete', hidden: true })).toHaveAttribute('tabindex', '-1');
  });

  it('opens the trailing rail on a start-ward swipe and reports it', () => {
    const onOpenChange = vi.fn();
    renderRow({ onOpenChange });
    const content = screen.getByText('Weekly report').parentElement as HTMLElement;
    swipe(content, 200, 120);
    expect(onOpenChange).toHaveBeenCalledWith('trailing');
    expect(screen.getByTestId('row')).toHaveAttribute('data-open', 'trailing');
  });

  it('opens the rails from the keyboard, focuses the first action, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderRow({ onOpenChange });
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(onOpenChange).toHaveBeenCalledWith('trailing');
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('row')).not.toHaveAttribute('data-open');
  });

  it('runs the action and closes the rail on selection', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(
      <SwipeActions data-testid="row" trailing={<SwipeActions.Action onClick={onArchive}>Archive</SwipeActions.Action>} defaultOpen="trailing">
        <p>Weekly report</p>
      </SwipeActions>,
    );
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('row')).not.toHaveAttribute('data-open');
  });

  it('respects a controlled open rail', () => {
    renderRow({ open: 'trailing' });
    expect(screen.getByTestId('row')).toHaveAttribute('data-open', 'trailing');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('does not open a rail that has no actions', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderRow({ onOpenChange });
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
