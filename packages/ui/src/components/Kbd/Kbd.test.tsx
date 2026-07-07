/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Kbd } from './Kbd';

/**
 * Declaring the constants
 */

describe('Kbd', () => {
  it('renders a semantic kbd element', () => {
    const { container } = render(<Kbd keys='mod+K' mac />);
    expect(container.querySelector('kbd')).toBeInTheDocument();
  });

  it('maps mod to ⌘ on macOS and Ctrl elsewhere', () => {
    const { rerender } = render(<Kbd keys='mod+K' mac data-testid='kbd' />);
    expect(screen.getByTestId('kbd')).toHaveTextContent('⌘K');
    rerender(<Kbd keys='mod+K' mac={false} data-testid='kbd' />);
    expect(screen.getByTestId('kbd')).toHaveTextContent('CtrlK');
  });

  it('orders modifiers ⌃ ⌥ ⇧ ⌘ before the key', () => {
    render(<Kbd keys='mod+shift+P' mac data-testid='kbd' />);
    expect(screen.getByTestId('kbd')).toHaveTextContent('⇧⌘P');
  });

  it('supplies a spoken accessible name', () => {
    render(<Kbd keys='mod+K' mac />);
    expect(screen.getByLabelText('Command K')).toBeInTheDocument();
  });

  it('renders children when no keys are given', () => {
    render(<Kbd>Esc</Kbd>);
    expect(screen.getByText('Esc')).toBeInTheDocument();
  });
});
