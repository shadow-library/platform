/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Tabs } from './Tabs';

/**
 * Declaring the constants
 */
function Example(props: { onValueChange?: (value: string) => void; defaultValue?: string }) {
  return (
    <Tabs defaultValue={props.defaultValue ?? 'overview'} onValueChange={props.onValueChange}>
      <Tabs.List aria-label='Service views'>
        <Tabs.Tab value='overview'>Overview</Tabs.Tab>
        <Tabs.Tab value='logs' count={12}>
          Logs
        </Tabs.Tab>
        <Tabs.Tab value='settings' disabled>
          Settings
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value='overview'>Overview panel</Tabs.Panel>
      <Tabs.Panel value='logs'>Logs panel</Tabs.Panel>
      <Tabs.Panel value='settings'>Settings panel</Tabs.Panel>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('marks the active tab and shows only its panel', () => {
    render(<Example />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Overview panel')).toBeInTheDocument();
    expect(screen.queryByText('Logs panel')).not.toBeInTheDocument();
  });

  it('switches panels on click and reports the value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);
    await user.click(screen.getByRole('tab', { name: /Logs/ }));
    expect(onValueChange).toHaveBeenCalledWith('logs');
    expect(screen.getByText('Logs panel')).toBeInTheDocument();
  });

  it('exposes a disabled tab that cannot be selected', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const settings = screen.getByRole('tab', { name: 'Settings' });
    expect(settings).toBeDisabled();
    await user.click(settings);
    expect(screen.queryByText('Settings panel')).not.toBeInTheDocument();
  });

  it('is one tab stop with roving focus', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
  });
});
