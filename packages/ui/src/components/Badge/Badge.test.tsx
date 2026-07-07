/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Badge } from './Badge';

/**
 * Declaring the constants
 */

describe('Badge', () => {
  it('renders its label with the default soft/neutral variant', () => {
    render(<Badge>Archived</Badge>);
    const badge = screen.getByText('Archived');
    expect(badge).toHaveAttribute('data-variant', 'soft');
    expect(badge).toHaveAttribute('data-intent', 'neutral');
  });

  it('reflects intent and variant on the element', () => {
    render(
      <Badge intent='success' variant='soft'>
        Active
      </Badge>,
    );
    expect(screen.getByText('Active')).toHaveAttribute('data-intent', 'success');
  });

  it('renders a leading dot when dot is set or variant is dot', () => {
    const { container, rerender } = render(
      <Badge intent='success' dot>
        Active
      </Badge>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    rerender(<Badge variant='dot'>Active</Badge>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('caps a count at max with a trailing plus', () => {
    render(
      <Badge variant='count' intent='danger' max={99}>
        {128}
      </Badge>,
    );
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('renders a count under the cap unchanged', () => {
    render(
      <Badge variant='count' max={99}>
        {12}
      </Badge>,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('is a plain non-interactive span (no role, no tabindex)', () => {
    render(<Badge>Beta</Badge>);
    const badge = screen.getByText('Beta');
    expect(badge.tagName).toBe('SPAN');
    expect(badge).not.toHaveAttribute('tabindex');
    expect(badge).not.toHaveAttribute('role');
  });

  it('passes through an accessible label for count badges', () => {
    render(
      <Badge variant='count' intent='danger' aria-label='12 unread notifications'>
        {12}
      </Badge>,
    );
    expect(screen.getByLabelText('12 unread notifications')).toBeInTheDocument();
  });
});
