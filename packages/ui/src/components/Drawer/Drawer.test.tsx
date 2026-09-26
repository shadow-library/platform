/**
 * Importing npm packages
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Drawer } from './Drawer';

/**
 * Declaring the constants
 */

describe('Drawer', () => {
  it('modal renders a dialog labelled by its title and closes via the close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange} modal>
        <Drawer.Header title="checkout-service" meta="Deploy 7f3a" />
        <Drawer.Body>body</Drawer.Body>
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'checkout-service' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('non-modal renders a complementary landmark named by its title', () => {
    render(
      <Drawer open modal={false} onOpenChange={() => {}}>
        <Drawer.Header title="checkout-service" />
      </Drawer>,
    );
    expect(screen.getByRole('complementary', { name: 'checkout-service' })).toBeInTheDocument();
  });

  it('non-modal closes on Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <Drawer open modal={false} onOpenChange={onOpenChange}>
        <Drawer.Header title="Service" />
        <Drawer.Body>b</Drawer.Body>
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('non-modal stays open when onEscapeKeyDown prevents the default', () => {
    const onOpenChange = vi.fn();
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
    render(
      <Drawer open modal={false} onOpenChange={onOpenChange} onEscapeKeyDown={onEscapeKeyDown}>
        <Drawer.Header title="Service" />
        <Drawer.Body>b</Drawer.Body>
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('modal stays open when onEscapeKeyDown prevents the default', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange} onEscapeKeyDown={event => event.preventDefault()}>
        <Drawer.Header title="Service" />
        <Drawer.Body>b</Drawer.Body>
      </Drawer>,
    );
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('modal lets onOpenAutoFocus choose where focus lands', () => {
    render(
      <Drawer
        open
        onOpenChange={() => {}}
        onOpenAutoFocus={event => {
          event.preventDefault();
          document.getElementById('target')?.focus();
        }}
      >
        <Drawer.Header title="Service" />
        <Drawer.Body>
          <button type="button">first</button>
          <button type="button" id="target">
            second
          </button>
        </Drawer.Body>
      </Drawer>,
    );
    expect(document.activeElement?.id).toBe('target');
  });

  it('fires the footer action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Drawer open modal={false} onOpenChange={() => {}}>
        <Drawer.Header title="Service" showClose={false} />
        <Drawer.Footer cancel="Cancel" action="Promote" onAction={onAction} />
      </Drawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Promote' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when a non-modal drawer is closed', () => {
    const { container } = render(
      <Drawer open={false} modal={false} onOpenChange={() => {}}>
        <Drawer.Header title="Service" />
      </Drawer>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
