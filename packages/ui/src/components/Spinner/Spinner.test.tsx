/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Spinner } from './Spinner';

/**
 * Declaring the constants
 */

describe('Spinner', () => {
  it('exposes a status role with visually-hidden label text', () => {
    render(<Spinner label="Loading deployments" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading deployments');
    expect(status).toHaveAttribute('data-size', 'md');
  });

  it('applies the size', () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-size', 'lg');
  });
});
