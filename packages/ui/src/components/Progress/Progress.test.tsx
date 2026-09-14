/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Progress } from './Progress';

/**
 * Declaring the constants
 */

describe('Progress', () => {
  it('exposes progressbar semantics with the current value', () => {
    render(<Progress value={64} max={100} label="Re-indexing" />);
    const bar = screen.getByRole('progressbar', { name: 'Re-indexing' });
    expect(bar).toHaveAttribute('aria-valuenow', '64');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('64%')).toBeInTheDocument();
  });

  it('omits the value and percent when indeterminate', () => {
    render(<Progress indeterminate label="Working" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('should name the progressbar from aria-label rather than the wrapper', () => {
    const { container } = render(<Progress value={3} max={10} aria-label="Receipt scans used today" />);
    expect(screen.getByRole('progressbar', { name: 'Receipt scans used today' })).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute('aria-label');
  });

  it('should name the progressbar from aria-labelledby', () => {
    render(
      <>
        <span id="upload-name">Uploading receipt.jpg</span>
        <Progress value={40} aria-labelledby="upload-name" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'Uploading receipt.jpg' })).toBeInTheDocument();
  });

  it('should prefer aria-label over the visible label for the accessible name', () => {
    render(<Progress value={60} label="Experience" aria-label="Experience towards level 15" />);
    expect(screen.getByRole('progressbar', { name: 'Experience towards level 15' })).toBeInTheDocument();
    expect(screen.getByText('Experience')).toBeInTheDocument();
  });

  it('clamps the percentage to 0–100', () => {
    render(<Progress value={150} max={100} label="Full" />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
