/**
 * Importing npm packages
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { PullToRefresh } from './PullToRefresh';

/**
 * Declaring the constants
 */
// happy-dom has no pointer-capture implementation; the component calls these on every pull.
beforeAll(() => {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

function pull(node: HTMLElement, from: number, to: number): void {
  fireEvent.pointerDown(node, { pointerId: 1, clientY: from, button: 0 });
  fireEvent.pointerMove(node, { pointerId: 1, clientY: from + 10 });
  fireEvent.pointerMove(node, { pointerId: 1, clientY: to });
  fireEvent.pointerUp(node, { pointerId: 1, clientY: to });
}

describe('PullToRefresh', () => {
  it('renders its scrollable content', () => {
    render(
      <PullToRefresh onRefresh={() => undefined} data-testid="ptr">
        <p>Inbox items</p>
      </PullToRefresh>,
    );
    expect(screen.getByText('Inbox items')).toBeInTheDocument();
  });

  it('refreshes when a pull travels past the threshold', async () => {
    const onRefresh = vi.fn();
    render(
      <PullToRefresh onRefresh={onRefresh} threshold={40} data-testid="ptr">
        <p>Inbox items</p>
      </PullToRefresh>,
    );
    // 200px of finger travel → 100px resisted distance, past the 40px threshold.
    pull(screen.getByTestId('ptr'), 10, 210);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('settles back without refreshing when released before the threshold', () => {
    const onRefresh = vi.fn();
    render(
      <PullToRefresh onRefresh={onRefresh} threshold={200} data-testid="ptr">
        <p>Inbox items</p>
      </PullToRefresh>,
    );
    pull(screen.getByTestId('ptr'), 10, 60);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores the gesture when disabled', () => {
    const onRefresh = vi.fn();
    render(
      <PullToRefresh onRefresh={onRefresh} threshold={40} disabled data-testid="ptr">
        <p>Inbox items</p>
      </PullToRefresh>,
    );
    pull(screen.getByTestId('ptr'), 10, 210);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('offers a keyboard refresh affordance and announces the refreshing state', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Inbox items</p>
      </PullToRefresh>,
    );
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing');
    release();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''));
  });

  it('does not stack refreshes while one is pending', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(() => new Promise<void>(() => undefined));
    render(
      <PullToRefresh onRefresh={onRefresh} threshold={40} data-testid="ptr">
        <p>Inbox items</p>
      </PullToRefresh>,
    );
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    pull(screen.getByTestId('ptr'), 10, 210);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
