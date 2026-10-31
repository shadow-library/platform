import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('renders a native button with its label as the accessible name', () => {
    render(<Button>Save changes</Button>);
    const button = screen.getByRole('button', { name: 'Save changes' });
    expect(button.tagName).toBe('BUTTON');
  });

  it('defaults to the secondary variant, md size, and type="button"', () => {
    render(<Button>Duplicate</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'md');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('reflects variant and size as data attributes', () => {
    render(
      <Button variant="primary" size="lg">
        Create
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'lg');
  });

  it('should leave data-tone off for the default neutral tone', () => {
    render(<Button variant="ghost">Revoke</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('data-tone');
  });

  it.each(['secondary', 'ghost', 'text'] as const)('should keep the %s variant and mark the danger tone', variant => {
    render(
      <Button variant={variant} tone="danger">
        Revoke
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', variant);
    expect(button).toHaveAttribute('data-tone', 'danger');
  });

  it('should render primary in the danger tone as the danger variant', () => {
    render(
      <Button variant="primary" tone="danger">
        Delete
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'danger');
  });

  it('should leave the danger variant unchanged by the danger tone', () => {
    render(
      <Button variant="danger" tone="danger">
        Delete
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'danger');
  });

  it('should keep a danger-toned button disabled and loading like any other', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="ghost" tone="danger" loading onClick={onClick}>
        Revoke
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should carry the danger tone onto an asChild element', () => {
    render(
      <Button asChild variant="ghost" tone="danger">
        <a href="/revoke">Revoke</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Revoke' })).toHaveAttribute('data-tone', 'danger');
  });

  it('merges a caller className with the component styles', () => {
    render(<Button className="custom">Go</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom');
  });

  it('renders prefix and suffix adornments', () => {
    render(
      <Button prefix={<span data-testid="prefix" />} suffix={<span data-testid="suffix" />}>
        Filter
      </Button>,
    );
    expect(screen.getByTestId('prefix')).toBeInTheDocument();
    expect(screen.getByTestId('suffix')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates on keyboard Enter and Space', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Press</Button>);
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should stay focusable but not fire onClick on click, Enter or Space when aria-disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button aria-disabled="true" onClick={onClick}>
        Unavailable
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeEnabled();
    await user.click(button);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(button).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks loading with aria-busy, disables, blocks clicks, and announces "Loading"', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Loading');
    expect(button).toHaveTextContent('Saving');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows the loadingText label beside the spinner and replaces the original label', () => {
    render(
      <Button loading loadingText="Saving…">
        Save changes
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Saving…');
    expect(button).not.toHaveTextContent('Save changes');
  });

  it('stretches to full width via data-full-width', () => {
    render(<Button fullWidth>Wide</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-full-width', 'true');
  });

  it('forwards the ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('renders the child element when asChild is set, merging styling and data attributes', () => {
    render(
      <Button asChild variant="primary">
        <a href="/dashboard">Dashboard</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(link).toHaveAttribute('data-variant', 'primary');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
