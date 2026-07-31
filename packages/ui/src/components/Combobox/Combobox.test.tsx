/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Combobox } from './Combobox';
import { type ComboboxOption } from './Combobox.types';

/**
 * Declaring the constants
 */
const people: ComboboxOption[] = [
  { value: '1', label: 'Maya Kim' },
  { value: '2', label: 'Jo Tan' },
  { value: '3', label: 'Ravi Sun' },
];

describe('Combobox', () => {
  it('opens on focus and filters as you type', async () => {
    const user = userEvent.setup();
    render(<Combobox options={people} aria-label="Owner" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.type(input, 'jo');
    expect(screen.getByRole('option', { name: 'Jo Tan' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Maya Kim' })).not.toBeInTheDocument();
  });

  it('opens and closes the listbox from the chevron button', async () => {
    const user = userEvent.setup();
    render(<Combobox options={people} aria-label="Owner" />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close options' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // Third click must reopen even though the input still holds focus from before.
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('stays open after clicking within the field', async () => {
    const user = userEvent.setup();
    render(<Combobox options={people} aria-label="Owner" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // A second click on the field is the trigger, not an outside dismiss — it must not close the popover.
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('commits the highlighted option with Enter', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox options={people} onValueChange={onValueChange} aria-label="Owner" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'ravi');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('3');
    expect(input).toHaveValue('Ravi Sun');
  });

  it('commits an option on click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox options={people} onValueChange={onValueChange} aria-label="Owner" />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Jo Tan' }));
    expect(onValueChange).toHaveBeenCalledWith('2');
  });

  it('shows the committed label and clears it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox options={people} defaultValue="1" onValueChange={onValueChange} aria-label="Owner" />);
    expect(screen.getByRole('combobox')).toHaveValue('Maya Kim');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('reverts to the committed label on Escape', async () => {
    const user = userEvent.setup();
    render(<Combobox options={people} defaultValue="1" aria-label="Owner" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'xyz');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Maya Kim');
  });

  it('offers a create row and fires onCreate', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<Combobox options={people} creatable onCreate={onCreate} aria-label="Label" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'infra');
    await user.click(screen.getByRole('option', { name: /Create/ }));
    expect(onCreate).toHaveBeenCalledWith('infra');
  });

  it('shows the empty message when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Combobox options={people} emptyMessage="No people" aria-label="Owner" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'zzz');
    expect(screen.getByText(/No people/)).toBeInTheDocument();
  });
});
