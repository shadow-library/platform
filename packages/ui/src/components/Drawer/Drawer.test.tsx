import { readFileSync } from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../Dialog';
import dialogStyles from '../Dialog/Dialog.module.css';
import { Select } from '../Select';
import selectStyles from '../Select/Select.module.css';
import { Drawer } from './Drawer';
import drawerStyles from './Drawer.module.css';

const COMPONENTS_DIR = path.join(import.meta.dirname, '..');
const TOKENS_CSS = readFileSync(path.join(COMPONENTS_DIR, '../styles/tokens.css'), 'utf8');

function tokenLayer(token: string): number {
  const value = new RegExp(`${token}: (\\d+);`).exec(TOKENS_CSS)?.[1];
  if (value === undefined) throw new Error(`${token} is not a numeric z-index token`);
  return Number(value);
}

function layerOf(stylesheet: string, className: string): number {
  const css = readFileSync(path.join(COMPONENTS_DIR, stylesheet), 'utf8');
  const token = new RegExp(`^\\.${className} \\{[^}]*z-index: var\\((--sh-z-[\\w-]+)\\)`, 'm').exec(css)?.[1];
  if (token === undefined) throw new Error(`.${className} in ${stylesheet} sets no z-index token`);
  return tokenLayer(token);
}

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

describe('Drawer layering', () => {
  it('should open a Select listbox from inside the drawer above the drawer panel and its scrim', async () => {
    const user = userEvent.setup();
    render(
      <Drawer open onOpenChange={() => {}}>
        <Drawer.Header title="Effort" />
        <Drawer.Body>
          <Select aria-label="Default effort" placeholder="Pick one">
            <Select.Item value="low">Low</Select.Item>
            <Select.Item value="high">High</Select.Item>
          </Select>
        </Drawer.Body>
      </Drawer>,
    );
    const panel = screen.getByRole('dialog', { name: 'Effort' });
    await user.click(screen.getByRole('combobox', { name: 'Default effort' }));
    const listbox = await screen.findByRole('listbox');

    expect(panel).toHaveClass(drawerStyles.panel!);
    expect(listbox).toHaveClass(selectStyles.content!);
    expect(panel).not.toContainElement(listbox);
    expect(layerOf('Select/Select.module.css', 'content')).toBeGreaterThan(layerOf('Drawer/Drawer.module.css', 'panel'));
    expect(layerOf('Select/Select.module.css', 'content')).toBeGreaterThan(layerOf('Drawer/Drawer.module.css', 'scrim'));
  });

  it('should dim the drawer under a confirm opened from it', () => {
    render(
      <Drawer open onOpenChange={() => {}}>
        <Drawer.Header title="Edit budget" />
        <Drawer.Body>
          <ConfirmDialog open title="Publish this budget change?" onOpenChange={() => {}} onConfirm={() => {}} />
        </Drawer.Body>
      </Drawer>,
    );
    const panel = document.querySelector(`.${drawerStyles.panel}`);
    const confirmScrim = document.querySelector(`.${dialogStyles.scrim}`);

    expect(screen.getByRole('alertdialog', { name: 'Publish this budget change?' })).toBeInTheDocument();
    expect(panel).not.toBeNull();
    expect(confirmScrim).not.toBeNull();
    expect(panel!.compareDocumentPosition(confirmScrim!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(layerOf('Dialog/Dialog.module.css', 'scrim')).toBeGreaterThanOrEqual(layerOf('Drawer/Drawer.module.css', 'panel'));
  });
});
