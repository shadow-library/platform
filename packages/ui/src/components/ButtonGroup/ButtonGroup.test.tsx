/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { ButtonGroup } from './ButtonGroup';

/**
 * Declaring the constants
 */

describe('ButtonGroup', () => {
  it('renders an attached group with the role and label', () => {
    render(
      <ButtonGroup aria-label="Zoom">
        <Button>Out</Button>
        <Button>In</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group', { name: 'Zoom' });
    expect(group).toHaveAttribute('data-attached', 'true');
    expect(group).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('drops the group role when unattached and no explicit role is given', () => {
    const { container } = render(
      <ButtonGroup attached={false}>
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>,
    );
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-attached', 'false');
  });

  it('imposes its variant and size on member buttons, overriding their own props', () => {
    render(
      <ButtonGroup variant="primary" size="lg">
        <Button>Inherits</Button>
        <Button variant="ghost" size="sm">
          Overridden
        </Button>
      </ButtonGroup>,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('data-variant', 'primary');
      expect(button).toHaveAttribute('data-size', 'lg');
    }
  });

  it('warns in development when a member tries to diverge from the group', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <ButtonGroup variant="primary">
        <Button variant="danger">Nope</Button>
      </ButtonGroup>,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ButtonGroup'));
    warn.mockRestore();
  });

  it('disables the whole group by making it inert and dimming once', () => {
    render(
      <ButtonGroup aria-label="Zoom" disabled>
        <Button>Out</Button>
        <Button>In</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group', { name: 'Zoom' });
    expect(group).toHaveAttribute('data-disabled', 'true');
    expect(group).toHaveAttribute('inert');
  });

  it('forwards the ref to the container element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ButtonGroup ref={ref} aria-label="Zoom">
        <Button>Out</Button>
      </ButtonGroup>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  describe('toolbar roving tabindex', () => {
    function Toolbar() {
      return (
        <ButtonGroup role="toolbar" aria-label="Actions" attached={false} variant="ghost">
          <Button>One</Button>
          <Button>Two</Button>
          <Button>Three</Button>
        </ButtonGroup>
      );
    }

    it('exposes a single tab stop', () => {
      render(<Toolbar />);
      const [first, second, third] = screen.getAllByRole('button');
      expect(first).toHaveAttribute('tabindex', '0');
      expect(second).toHaveAttribute('tabindex', '-1');
      expect(third).toHaveAttribute('tabindex', '-1');
    });

    it('moves focus with the arrow keys and wraps', async () => {
      const user = userEvent.setup();
      render(<Toolbar />);
      const [first, second, third] = screen.getAllByRole('button');
      first?.focus();
      await user.keyboard('{ArrowRight}');
      expect(second).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(third).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(first).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      expect(third).toHaveFocus();
    });

    it('jumps to the ends with Home and End', async () => {
      const user = userEvent.setup();
      render(<Toolbar />);
      const [first, , third] = screen.getAllByRole('button');
      first?.focus();
      await user.keyboard('{End}');
      expect(third).toHaveFocus();
      await user.keyboard('{Home}');
      expect(first).toHaveFocus();
    });

    it('sets aria-orientation for assistive tech', () => {
      render(<Toolbar />);
      expect(screen.getByRole('toolbar')).toHaveAttribute('aria-orientation', 'horizontal');
    });
  });
});
