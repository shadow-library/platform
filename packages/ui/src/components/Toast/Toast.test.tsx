/**
 * Importing npm packages
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from './Toast';
/**
 * Importing user defined packages
 */
import { toast } from './Toast.store';

/**
 * Declaring the constants
 */
afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

describe('Toast', () => {
  it('shows a success toast pushed through the imperative API', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Environment created');
    });
    expect(screen.getByText('Environment created')).toBeInTheDocument();
  });

  it('gives a danger toast an assertive alert role', () => {
    render(<Toaster />);
    act(() => {
      toast.danger('Deploy failed', { body: 'Build step 3 exited with code 1.' });
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Deploy failed');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('dismisses a toast by id', () => {
    render(<Toaster />);
    let id = '';
    act(() => {
      id = toast.success('Saved');
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => {
      toast.dismiss(id);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('runs the action then dismisses', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success('Workspace deleted', { action: { label: 'Undo', onClick } });
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Workspace deleted')).not.toBeInTheDocument();
  });

  it('anchors the viewport to the configured placement', () => {
    render(<Toaster placement="top-start" />);
    act(() => {
      toast.info('Positioned');
    });
    const viewport = screen.getByText('Positioned').closest('[data-placement]');
    expect(viewport).toHaveAttribute('data-placement', 'top-start');
  });

  it('caps the visible stack at max', () => {
    render(<Toaster max={2} />);
    act(() => {
      toast.info('one');
      toast.info('two');
      toast.info('three');
    });
    expect(screen.queryByText('one')).not.toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
  });

  it('renders nothing on the server so hydration can never mismatch', () => {
    expect(renderToStaticMarkup(<Toaster />)).toBe('');
  });
});
