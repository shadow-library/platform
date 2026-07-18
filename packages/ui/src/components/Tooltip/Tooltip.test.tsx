/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Tooltip, TooltipProvider } from './Tooltip';

/**
 * Declaring the constants
 */

describe('Tooltip', () => {
  it('renders the trigger and shows content when open', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Duplicate" defaultOpen>
          <button type="button">Copy</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: /Copy/ })).toBeInTheDocument();
    expect(screen.getAllByText('Duplicate').length).toBeGreaterThan(0);
  });

  it('renders the shortcut hint alongside the label', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Duplicate" shortcut="⌘D" defaultOpen>
          <button type="button">Copy</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getAllByText('⌘D').length).toBeGreaterThan(0);
  });

  it('describes the trigger while open', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Duplicate" defaultOpen>
          <button type="button">Copy</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: /Copy/ })).toHaveAttribute('aria-describedby');
  });

  it('renders the trigger alone when there is no content', () => {
    render(
      <Tooltip content={undefined}>
        <button type="button">Copy</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
