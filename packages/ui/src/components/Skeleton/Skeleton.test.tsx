/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Skeleton } from './Skeleton';

/**
 * Declaring the constants
 */

describe('Skeleton', () => {
  it('renders a decorative ghost with the shape and size', () => {
    const { container } = render(<Skeleton shape='circle' width={32} data-testid='ghost' />);
    const ghost = screen.getByTestId('ghost');
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost).toHaveAttribute('data-shape', 'circle');
    expect(ghost).toHaveStyle({ width: '32px', height: '32px' });
    expect(container.querySelector('[data-shape="circle"]')).toBeInTheDocument();
  });

  it('renders the table preset as a busy region', () => {
    const { container } = render(<Skeleton.Table rows={3} columns={4} />);
    const region = container.firstElementChild;
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('[data-shape="line"]')).toHaveLength(12);
  });

  it('renders the list preset with avatar ghosts', () => {
    const { container } = render(<Skeleton.List rows={2} />);
    expect(container.querySelectorAll('[data-shape="circle"]')).toHaveLength(2);
  });
});
