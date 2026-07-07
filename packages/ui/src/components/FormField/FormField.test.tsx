/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Input } from '../Input';
import { FormField } from './FormField';

/**
 * Declaring the constants
 */

describe('FormField', () => {
  it('links the label to the control so clicking it focuses the field', async () => {
    const user = userEvent.setup();
    render(
      <FormField label='Display name'>
        <Input />
      </FormField>,
    );
    await user.click(screen.getByText('Display name'));
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
  });

  it('links helper text via aria-describedby', () => {
    render(
      <FormField label='Display name' helper='Shown in the sidebar'>
        <Input />
      </FormField>,
    );
    const input = screen.getByRole('textbox');
    const helper = screen.getByText('Shown in the sidebar');
    expect(input.getAttribute('aria-describedby')).toBe(helper.id);
  });

  it('replaces helper with an error and makes the control invalid', () => {
    render(
      <FormField label='Workspace URL' helper='Lowercase only' error='Only lowercase letters, numbers, and hyphens'>
        <Input />
      </FormField>,
    );
    expect(screen.queryByText('Lowercase only')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Only lowercase letters, numbers, and hyphens');
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('renders the required and optional markers', () => {
    const { rerender } = render(
      <FormField label='Email' required>
        <Input />
      </FormField>,
    );
    expect(screen.getByText('Required')).toBeInTheDocument();
    rerender(
      <FormField label='Phone' optional>
        <Input />
      </FormField>,
    );
    expect(screen.getByText('Optional')).toBeInTheDocument();
  });

  it('disables the wrapped control', () => {
    render(
      <FormField label='Email' disabled>
        <Input />
      </FormField>,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('respects an id already set on the control', () => {
    render(
      <FormField label='Email'>
        <Input id='custom-email' />
      </FormField>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'custom-email');
    expect(screen.getByText('Email')).toHaveAttribute('for', 'custom-email');
  });

  it('merges an existing aria-describedby on the control', () => {
    render(
      <FormField label='Email' helper='We never share it'>
        <Input aria-describedby='external-hint' />
      </FormField>,
    );
    const describedBy = screen.getByRole('textbox').getAttribute('aria-describedby');
    expect(describedBy).toContain('external-hint');
    expect(describedBy).toContain(screen.getByText('We never share it').id);
  });
});
