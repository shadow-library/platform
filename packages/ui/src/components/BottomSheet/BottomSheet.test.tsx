/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { BottomSheet } from './BottomSheet';

/**
 * Declaring the constants
 */
function Harness({ onOpenChange, ...rest }: { onOpenChange?: (open: boolean) => void } & Partial<Parameters<typeof BottomSheet>[0]>) {
  const [open, setOpen] = useState(true);
  return (
    <BottomSheet
      open={open}
      onOpenChange={next => {
        setOpen(next);
        onOpenChange?.(next);
      }}
      title="Filter results"
      snapPoints={rest.snapPoints ?? ['content']}
      dismissable={rest.dismissable}
    >
      <p>Body content</p>
    </BottomSheet>
  );
}

describe('BottomSheet', () => {
  it('renders a labelled modal dialog with its content', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Filter results' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('cycles snap points from the grabber, announcing the current one', async () => {
    const user = userEvent.setup();
    render(<Harness snapPoints={['content', 'full']} />);
    const grabber = screen.getByRole('button', { name: 'Resize sheet, content height' });
    await user.click(grabber);
    expect(screen.getByRole('button', { name: 'Resize sheet, full height' })).toBeInTheDocument();
  });

  it('closes on Escape when dismissable', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close on Escape when not dismissable', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} dismissable={false} />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
