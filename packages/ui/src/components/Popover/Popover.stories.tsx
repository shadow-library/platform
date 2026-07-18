/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { Input } from '../Input';
import { Popover } from './Popover';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Popover>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A small form popover — the page stays interactive behind it. */
export const Default: Story = {
  render: () => (
    <Popover>
      <Popover.Trigger asChild>
        <Button variant="secondary">Share settings</Button>
      </Popover.Trigger>
      <Popover.Content>
        <Popover.Header title="Share this dashboard" description="Anyone with the link can view." />
        <div style={{ display: 'flex', gap: 8 }}>
          <Input defaultValue="shadow.app/d/8f3a" readOnly aria-label="Share link" />
          <Popover.Close asChild>
            <Button>Copy</Button>
          </Popover.Close>
        </div>
      </Popover.Content>
    </Popover>
  ),
};

/** Headerless — pass aria-label so the dialog has an accessible name. */
export const Headerless: Story = {
  render: () => (
    <Popover>
      <Popover.Trigger asChild>
        <Button variant="secondary">Columns</Button>
      </Popover.Trigger>
      <Popover.Content aria-label="Choose columns">
        <div style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>Column picker content.</div>
      </Popover.Content>
    </Popover>
  ),
};
