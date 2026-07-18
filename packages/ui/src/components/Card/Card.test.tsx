/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Card } from './Card';

/**
 * Declaring the constants
 */

describe('Card', () => {
  it('renders its content inside the surface', () => {
    render(
      <Card>
        <Card.Body>Usage report</Card.Body>
      </Card>,
    );
    expect(screen.getByText('Usage report')).toBeInTheDocument();
  });

  it('renders the header title and action', () => {
    render(
      <Card>
        <Card.Header title="API usage" action={<button type="button">More</button>} />
      </Card>,
    );
    expect(screen.getByText('API usage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('marks interactive and selected via data attributes', () => {
    const { rerender } = render(<Card interactive>card</Card>);
    expect(screen.getByText('card')).toHaveAttribute('data-interactive', 'true');
    rerender(<Card selected>card</Card>);
    expect(screen.getByText('card')).toHaveAttribute('data-selected', 'true');
  });

  it('renders as an anchor through asChild and forwards props', () => {
    render(
      <Card asChild interactive>
        <a href="/services/checkout">
          <Card.Body>checkout-service</Card.Body>
        </a>
      </Card>,
    );
    const link = screen.getByRole('link', { name: 'checkout-service' });
    expect(link).toHaveAttribute('href', '/services/checkout');
    expect(link).toHaveAttribute('data-interactive', 'true');
  });

  it('propagates the padding scale to sections', () => {
    render(
      <Card padding="lg">
        <Card.Header title="Title" />
        <Card.Body>body</Card.Body>
        <Card.Footer>footer</Card.Footer>
      </Card>,
    );
    expect(screen.getByText('Title').parentElement).toHaveAttribute('data-padding', 'lg');
    expect(screen.getByText('body')).toHaveAttribute('data-padding', 'lg');
    expect(screen.getByText('footer')).toHaveAttribute('data-padding', 'lg');
  });

  it('forwards the ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>card</Card>);
    expect(ref.current).toBe(screen.getByText('card'));
  });
});
