import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from './Tabs';

const css = readFileSync(path.join(import.meta.dirname, 'Tabs.module.css'), 'utf-8');

function KeptExample(props: { value?: string }) {
  return (
    <Tabs defaultValue={props.value === undefined ? 'overview' : undefined} value={props.value}>
      <Tabs.List aria-label="Bot sections">
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview">Overview panel</Tabs.Panel>
      <Tabs.Panel value="settings" keepMounted>
        <label>
          Name
          <input defaultValue="" />
        </label>
      </Tabs.Panel>
    </Tabs>
  );
}

function Example(props: { onValueChange?: (value: string) => void; defaultValue?: string }) {
  return (
    <Tabs defaultValue={props.defaultValue ?? 'overview'} onValueChange={props.onValueChange}>
      <Tabs.List aria-label="Service views">
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="logs" count={12}>
          Logs
        </Tabs.Tab>
        <Tabs.Tab value="settings" disabled>
          Settings
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview">Overview panel</Tabs.Panel>
      <Tabs.Panel value="logs">Logs panel</Tabs.Panel>
      <Tabs.Panel value="settings">Settings panel</Tabs.Panel>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('marks the active tab and shows only its panel', () => {
    render(<Example />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Overview panel')).toBeInTheDocument();
    expect(screen.queryByText('Logs panel')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toEqual([screen.getByRole('tabpanel', { name: 'Overview' })]);
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

  it('should empty and hide an inactive panel by default', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('tab', { name: /Logs/ }));
    expect(screen.queryByText('Overview panel')).not.toBeInTheDocument();
    const inactive = screen.getAllByRole('tabpanel', { hidden: true }).filter(panel => panel.getAttribute('data-state') === 'inactive');
    expect(inactive).toHaveLength(2);
    for (const panel of inactive) expect(panel).toHaveAttribute('hidden');
  });

  it('should keep inactive default panels out of the accessibility tree', () => {
    render(<Example />);
    const inactive = screen.getAllByRole('tabpanel', { hidden: true }).filter(panel => panel.getAttribute('data-state') === 'inactive');
    expect(inactive).toHaveLength(2);
    for (const panel of inactive) expect(panel).not.toBeVisible();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('should keep a keepMounted panel mounted but hidden while inactive', () => {
    render(<KeptExample />);
    const input = screen.getByLabelText('Name', { selector: 'input' });
    const panel = input.closest('[role="tabpanel"]');
    expect(panel).toHaveAttribute('hidden');
    expect(panel).not.toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('should keep an inactive keepMounted panel and its controls out of the accessibility tree', () => {
    render(<KeptExample />);
    expect(screen.getByLabelText('Name', { selector: 'input' })).not.toBeVisible();
    expect(screen.getAllByRole('tabpanel')).toEqual([screen.getByRole('tabpanel', { name: 'Overview' })]);
  });

  it('should preserve a keepMounted panel state across switches', async () => {
    const user = userEvent.setup();
    render(<KeptExample />);
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    const panel = screen.getByRole('tabpanel', { name: 'Settings' });
    expect(panel).not.toHaveAttribute('hidden');
    await user.type(screen.getByLabelText('Name', { selector: 'input' }), 'ingest');

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.click(screen.getByRole('tab', { name: 'Settings' }));

    expect(screen.getByLabelText('Name', { selector: 'input' })).toHaveValue('ingest');
  });

  it('should follow a controlled value for a keepMounted panel', () => {
    const { rerender } = render(<KeptExample value="overview" />);
    expect(screen.getByLabelText('Name', { selector: 'input' }).closest('[role="tabpanel"]')).toHaveAttribute('hidden');
    rerender(<KeptExample value="settings" />);
    expect(screen.getByRole('tabpanel', { name: 'Settings' })).not.toHaveAttribute('hidden');
  });

  it('should draw the horizontal baseline as an inset shadow so a scrolling row raises no vertical scrollbar', () => {
    const list = /\n\.list \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(list).toMatch(/overflow-x: auto;/);
    expect(list).toMatch(/box-shadow: inset/);
    expect(list).not.toMatch(/border-bottom/);
    expect(/\n\.tab \{([^}]*)\}/.exec(css)?.[1]).not.toMatch(/margin-bottom/);
  });
});
