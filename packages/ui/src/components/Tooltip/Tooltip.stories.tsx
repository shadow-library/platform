/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { IconButton } from '../IconButton';
import { Tooltip, TooltipProvider } from './Tooltip';

/**
 * Declaring the constants
 */
function CopyIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='5' y='5' width='8' height='8' rx='1.5' />
      <path d='M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 4v5A1.5 1.5 0 0 0 4.5 10.5H5' />
    </svg>
  );
}

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  args: { content: 'Duplicate', children: <IconButton aria-label='Duplicate' icon={<CopyIcon />} /> },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Names an icon-only control. */
export const Label: Story = {
  render: () => (
    <Tooltip content='Duplicate'>
      <IconButton aria-label='Duplicate' icon={<CopyIcon />} />
    </Tooltip>
  ),
};

/** Label plus the keyboard shortcut in mono. */
export const WithShortcut: Story = {
  render: () => (
    <Tooltip content='Duplicate' shortcut='⌘D'>
      <IconButton aria-label='Duplicate' icon={<CopyIcon />} />
    </Tooltip>
  ),
};

/** A one-sentence definition wraps at 240px. */
export const Definition: Story = {
  render: () => (
    <Tooltip content='Rotates every 90 days. Admins are notified before expiry.'>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a definition-tooltip term trigger must be focusable so the tooltip shows on keyboard focus */}
      <span style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', borderBottom: '1px dashed var(--sh-text-tertiary)', cursor: 'help' }} tabIndex={0}>
        Signing key
      </span>
    </Tooltip>
  ),
};
