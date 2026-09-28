/**
 * Importing npm packages
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { FileUpload } from './FileUpload';
import { type FileItem } from './FileUpload.types';

/**
 * Declaring the constants
 */
function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('no file input');
  return input as HTMLInputElement;
}

/** Hands FileUpload a fresh inline callback on every render that also updates the parent, as a route screen does; capped so a loop fails fast. */
function StatefulParent({ onFiles }: { onFiles: (files: FileItem[]) => void }) {
  const [, setSelection] = useState<{ files: FileItem[] }>();
  const renders = useRef(0);
  return (
    <FileUpload
      aria-label="Choose files"
      onValueChange={files => {
        onFiles(files);
        if (++renders.current <= 10) setSelection({ files });
      }}
    />
  );
}

describe('FileUpload', () => {
  it('names the constraints in the dropzone accessible name', () => {
    render(<FileUpload accept={['.pdf', '.png']} maxSize={25 * 1024 * 1024} aria-label="Choose files" />);
    expect(screen.getByRole('button', { name: /Choose files.*up to 25\.0 MB each/ })).toBeInTheDocument();
  });

  it('adds a valid selected file as a row', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileUpload accept={['.pdf']} aria-label="Choose files" />);
    await user.upload(fileInput(container), new File(['x'], 'contract.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
  });

  it('rejects an oversized file as an error row naming the rule', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileUpload maxSize={10} aria-label="Choose files" />);
    await user.upload(fileInput(container), new File(['x'.repeat(100)], 'big.png', { type: 'image/png' }));
    expect(screen.getByText(/exceeds 10 B limit/)).toBeInTheDocument();
  });

  it('rejects a disallowed dropped file type', () => {
    render(<FileUpload accept={['.pdf']} aria-label="Choose files" />);
    const zone = screen.getByRole('button', { name: /Choose files/ });
    const png = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [png], types: ['Files'] } });
    expect(screen.getByText(/not allowed/)).toBeInTheDocument();
  });

  it('removes a file by its labelled button', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileUpload aria-label="Choose files" />);
    await user.upload(fileInput(container), new File(['x'], 'notes.txt'));
    await user.click(screen.getByRole('button', { name: 'Remove notes.txt' }));
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
  });

  it('should report a selection once when the parent re-renders with a new callback', async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    const { container } = render(<StatefulParent onFiles={onFiles} />);
    await user.upload(fileInput(container), new File(['{}'], 'bundle.json', { type: 'application/json' }));

    expect(onFiles.mock.calls.map(([files]) => files.map((file: FileItem) => file.name))).toEqual([[], ['bundle.json']]);
  });

  it('renders the compact button variant', () => {
    render(<FileUpload variant="button" aria-label="Attach files" />);
    expect(screen.getByRole('button', { name: /Attach files/ })).toBeInTheDocument();
  });
});
