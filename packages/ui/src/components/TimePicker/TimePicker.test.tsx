/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { TimePicker } from './TimePicker';

/**
 * Declaring the constants
 */
const ROW_HEIGHT = 36;
const LIST_HEIGHT = 240;
const COMPONENTS_DIR = path.join(import.meta.dirname, '..');

/** happy-dom has no layout, so give every option a fixed row height stacked inside a fixed-height list. */
function mockListGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ROW_HEIGHT);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(LIST_HEIGHT);
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement): number {
    return this.parentElement ? Array.prototype.indexOf.call(this.parentElement.children, this) * ROW_HEIGHT : 0;
  });
}

function zLayer(stylesheet: string, selector: string): number {
  const tokens = fs.readFileSync(path.join(COMPONENTS_DIR, '../styles/tokens.css'), 'utf8');
  const css = fs.readFileSync(path.join(COMPONENTS_DIR, stylesheet), 'utf8');
  const token = new RegExp(`^${selector.replace('.', '\\.')} \\{[^}]*z-index: var\\((--sh-z-[\\w-]+)\\)`, 'm').exec(css)?.[1];
  const layer = token ? new RegExp(`${token}: (\\d+);`).exec(tokens)?.[1] : undefined;
  return Number(layer);
}

describe('TimePicker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the committed value formatted for 12-hour display', () => {
    render(<TimePicker value="21:30" hour12 aria-label="Doors" />);
    expect(screen.getByRole('combobox', { name: 'Doors' })).toHaveValue('9:30 PM');
  });

  it('parses loose typed input on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker onValueChange={onValueChange} aria-label="Time" />);
    const field = screen.getByRole('combobox');
    await user.type(field, '9.30pm');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith('21:30');
  });

  it('parses compact digit input (930 → 09:30)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker hour12={false} onValueChange={onValueChange} aria-label="Time" />);
    await user.type(screen.getByRole('combobox'), '930');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith('09:30');
  });

  it('reverts unparseable input, unchanged', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="08:00" onValueChange={onValueChange} aria-label="Time" />);
    const field = screen.getByRole('combobox');
    await user.clear(field);
    await user.type(field, 'zzz');
    await user.tab();
    expect(field).toHaveValue('8:00 AM');
  });

  it('opens the suggestion list and selects a time', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker hour12={false} step={60} onValueChange={onValueChange} aria-label="Time" />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    expect(onValueChange).toHaveBeenCalledWith('09:00');
  });

  it('should scroll the option list to the selected time', async () => {
    mockListGeometry();
    const user = userEvent.setup();
    render(<TimePicker value="06:30" hour12={false} aria-label="Wake time" />);
    const field = screen.getByRole('combobox');
    await user.click(field);

    const list = screen.getByRole('listbox');
    const option = screen.getByRole('option', { name: '06:30' });
    expect(field).toHaveAttribute('aria-activedescendant', option.id);
    expect(list.scrollTop).toBeGreaterThan(0);
    expect(option.offsetTop).toBeGreaterThanOrEqual(list.scrollTop);
    expect(option.offsetTop + option.offsetHeight).toBeLessThanOrEqual(list.scrollTop + list.clientHeight);
  });

  it('should keep typed time on Enter', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="07:00" hour12={false} onValueChange={onValueChange} aria-label="Time of day" />);
    const field = screen.getByRole('combobox');
    await user.click(field);
    await user.clear(field);
    await user.type(field, '07:30{Enter}');

    expect(onValueChange).toHaveBeenLastCalledWith('07:30');
    expect(field).toHaveValue('07:30');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('should keep a typed 24-hour time on Enter in 12-hour display', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="07:00" onValueChange={onValueChange} aria-label="Time of day" />);
    const field = screen.getByRole('combobox');
    await user.click(field);
    await user.clear(field);
    await user.type(field, '19:45{Enter}');

    expect(onValueChange).toHaveBeenLastCalledWith('19:45');
    expect(field).toHaveValue('7:45 PM');
  });

  it('should pick the highlighted time on Enter after arrow navigation', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="07:00" hour12={false} onValueChange={onValueChange} aria-label="Time of day" />);
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');

    expect(onValueChange).toHaveBeenLastCalledWith('07:30');
  });

  it('should not report an unchanged value on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="07:00" hour12={false} onValueChange={onValueChange} aria-label="Time of day" />);
    await user.click(screen.getByRole('combobox'));
    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('should reject a separated time with a one-digit minute instead of misreading it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="07:00" hour12={false} onValueChange={onValueChange} aria-label="Time of day" />);
    const field = screen.getByRole('combobox');
    await user.clear(field);
    await user.type(field, '12:5');
    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(field).toHaveValue('07:00');
  });

  it('should render 24-hour labels when hour12 is false', async () => {
    const user = userEvent.setup();
    render(<TimePicker value="21:30" hour12={false} aria-label="Cutoff" />);
    const field = screen.getByRole('combobox');
    expect(field).toHaveValue('21:30');
    await user.click(field);

    expect(screen.getByRole('option', { name: '13:00' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /PM|AM/ })).not.toBeInTheDocument();
  });

  it('should open the list from the clock button and keep focus in the field', async () => {
    const user = userEvent.setup();
    render(<TimePicker value="07:00" hour12={false} aria-label="Time of day" />);
    await user.click(screen.getByRole('button', { name: 'Choose time' }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('should report a change back to the original value before a controlled parent catches up', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="07:00" hour12={false} onValueChange={onValueChange} aria-label="Time of day" />);
    const field = screen.getByRole('combobox');

    await user.clear(field);
    await user.type(field, '08:00{Enter}');
    await user.clear(field);
    await user.type(field, '07:00{Enter}');
    expect(onValueChange.mock.calls).toEqual([['08:00'], ['07:00']]);
  });

  it('should open the list from the clock button on touch without focusing the field', async () => {
    const user = userEvent.setup();
    render(<TimePicker value="07:00" hour12={false} aria-label="Time of day" />);
    const field = screen.getByRole('combobox');
    expect(field).not.toHaveAttribute('aria-controls');

    await user.pointer({ keys: '[TouchA]', target: screen.getByRole('button', { name: 'Choose time' }) });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(field).not.toHaveFocus();
  });

  it('should not open the list when read-only', async () => {
    const user = userEvent.setup();
    render(<TimePicker value="07:00" readOnly aria-label="Time of day" />);
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('should layer the time list above dialogs', () => {
    const list = zLayer('TimePicker/TimePicker.module.css', '.content');
    expect(list).toBeGreaterThan(zLayer('Dialog/Dialog.module.css', '.positioner'));
    expect(list).toBeGreaterThan(zLayer('BottomSheet/BottomSheet.module.css', '.surface'));
  });
});
