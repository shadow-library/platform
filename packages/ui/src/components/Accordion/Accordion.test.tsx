/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Accordion } from './Accordion';

/**
 * Declaring the constants
 */

describe('Accordion', () => {
  it('renders heading buttons that toggle their panel', async () => {
    const user = userEvent.setup();
    render(
      <Accordion type='single' collapsible>
        <Accordion.Item value='billing' title='Billing'>
          Billing panel content
        </Accordion.Item>
      </Accordion>,
    );
    const trigger = screen.getByRole('button', { name: 'Billing' });
    expect(screen.getByRole('heading', { level: 3, name: 'Billing' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Billing panel content')).toBeVisible();
  });

  it('folds meta into the header accessible name', () => {
    render(
      <Accordion type='single' collapsible>
        <Accordion.Item value='billing' title='Billing' meta='2 issues'>
          content
        </Accordion.Item>
      </Accordion>,
    );
    expect(screen.getByRole('button', { name: 'Billing 2 issues' })).toBeInTheDocument();
  });

  it('single mode closes the previous item when another opens', async () => {
    const user = userEvent.setup();
    render(
      <Accordion type='single' collapsible defaultValue='a'>
        <Accordion.Item value='a' title='First'>
          first
        </Accordion.Item>
        <Accordion.Item value='b' title='Second'>
          second
        </Accordion.Item>
      </Accordion>,
    );
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Second' }));
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('respects a custom heading level', () => {
    render(
      <Accordion type='multiple' headingLevel={2}>
        <Accordion.Item value='a' title='Section'>
          content
        </Accordion.Item>
      </Accordion>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument();
  });
});
