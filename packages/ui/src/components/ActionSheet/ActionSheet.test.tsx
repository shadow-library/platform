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
import { ActionSheet } from './ActionSheet';

/**
 * Declaring the constants
 */
function Harness({ onOpenChange, ...rest }: { onOpenChange?: (open: boolean) => void } & Partial<Parameters<typeof ActionSheet>[0]>) {
  const [open, setOpen] = useState(true);
  return (
    <ActionSheet
      open={open}
      onOpenChange={next => {
        setOpen(next);
        onOpenChange?.(next);
      }}
      title={rest.title ?? 'Attachment'}
      aria-label={rest['aria-label']}
    >
      {rest.children ?? (
        <>
          <ActionSheet.Item>Take photo</ActionSheet.Item>
          <ActionSheet.Item>Browse files</ActionSheet.Item>
          <ActionSheet.Item intent="danger">Remove attachment</ActionSheet.Item>
        </>
      )}
    </ActionSheet>
  );
}

describe('ActionSheet', () => {
  it('renders a labelled modal dialog with an action row per item and a cancel row', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog', { name: 'Attachment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('runs the action and closes the sheet on selection', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onItemClick = vi.fn();
    render(<HarnessWithItemClick onOpenChange={onOpenChange} onItemClick={onItemClick} />);
    await user.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the sheet open when closeOnSelect is off', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Harness onOpenChange={onOpenChange}>
        <ActionSheet.Item closeOnSelect={false}>Toggle option</ActionSheet.Item>
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Toggle option' }));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('marks destructive rows with the danger intent', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Remove attachment' })).toHaveAttribute('data-intent', 'danger');
  });

  it('closes from the cancel row and from Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders grouped rows under a caption', () => {
    render(
      <Harness>
        <ActionSheet.Group label="Share">
          <ActionSheet.Item>Copy link</ActionSheet.Item>
        </ActionSheet.Group>
      </Harness>,
    );
    expect(screen.getByRole('group')).toHaveTextContent('Share');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});

function HarnessWithItemClick({ onOpenChange, onItemClick }: { onOpenChange: (open: boolean) => void; onItemClick: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ActionSheet
      open={open}
      onOpenChange={next => {
        setOpen(next);
        onOpenChange(next);
      }}
      title="Attachment"
    >
      <ActionSheet.Item onClick={onItemClick}>Take photo</ActionSheet.Item>
    </ActionSheet>
  );
}
