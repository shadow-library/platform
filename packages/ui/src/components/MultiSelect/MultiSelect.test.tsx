/**
 * Importing npm packages
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { MultiSelect } from './MultiSelect';
import { type MultiSelectOption } from './MultiSelect.types';

/**
 * Declaring the constants
 */
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const teams: MultiSelectOption[] = [
  { value: 'design', label: 'Design' },
  { value: 'platform', label: 'Platform' },
  { value: 'growth', label: 'Growth' },
  { value: 'security', label: 'Security', disabled: true },
];

describe('MultiSelect', () => {
  it('renders the placeholder when empty', () => {
    render(<MultiSelect aria-label='Teams' options={teams} placeholder='Select teams…' />);
    expect(screen.getByRole('button', { name: 'Teams' })).toHaveTextContent('Select teams…');
  });

  it('shows selected values as tags with a +N overflow', () => {
    render(<MultiSelect aria-label='Teams' options={teams} value={['design', 'platform', 'growth']} maxVisibleTags={2} onValueChange={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'Teams' });
    expect(within(trigger).getByText('Design')).toBeInTheDocument();
    expect(within(trigger).getByText('Platform')).toBeInTheDocument();
    expect(within(trigger).getByText('+1')).toBeInTheDocument();
  });

  it('opens a multi-selectable listbox of options', async () => {
    const user = userEvent.setup();
    render(<MultiSelect aria-label='Teams' options={teams} />);
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    expect(within(listbox).getAllByRole('option')).toHaveLength(4);
  });

  it('toggles an option and keeps the list open', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<MultiSelect aria-label='Teams' options={teams} onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    await user.click(await screen.findByRole('option', { name: 'Design' }));
    expect(onValueChange).toHaveBeenCalledWith(['design']);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('does not select a disabled option', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<MultiSelect aria-label='Teams' options={teams} onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    await user.click(await screen.findByRole('option', { name: 'Security' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('removes a value from its tag ×', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<MultiSelect aria-label='Teams' options={teams} value={['design', 'platform']} onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Remove Design' }));
    expect(onValueChange).toHaveBeenCalledWith(['platform']);
  });

  it('clears everything from the footer', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<MultiSelect aria-label='Teams' options={teams} value={['design', 'platform']} onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    await user.click(await screen.findByRole('button', { name: 'Clear all' }));
    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it('filters options when searchable', async () => {
    const user = userEvent.setup();
    render(<MultiSelect aria-label='Teams' options={teams} searchable />);
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    await user.type(await screen.findByRole('textbox', { name: 'Search options' }), 'grow');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Growth');
  });

  it('disables remaining options once maxSelected is reached', async () => {
    const user = userEvent.setup();
    render(<MultiSelect aria-label='Teams' options={teams} value={['design']} maxSelected={1} onValueChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    expect(await screen.findByRole('option', { name: 'Platform' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Max 1')).toBeInTheDocument();
  });

  it('supports select-all with an indeterminate partial state', async () => {
    function Controlled() {
      const [value, setValue] = useState<string[]>(['design']);
      return <MultiSelect aria-label='Teams' options={teams} selectAll value={value} onValueChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    const selectAllRow = await screen.findByRole('option', { name: 'Select all' });
    expect(selectAllRow).toHaveAttribute('aria-selected', 'false');
    await user.click(selectAllRow);
    // design + platform + growth become selected (security is disabled and skipped)
    expect(await screen.findByRole('option', { name: 'Select all' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Teams' })).toHaveTextContent('Growth');
  });
});
