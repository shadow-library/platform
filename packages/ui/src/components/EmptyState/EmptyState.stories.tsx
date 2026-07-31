/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { EmptyState } from './EmptyState';

/**
 * Declaring the constants
 */
function RepoArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="20" y="24" width="56" height="48" rx="6" />
      <path d="M20 38h56M32 52h20" strokeLinecap="round" />
      <circle cx="68" cy="30" r="3" fill="var(--sh-accent)" stroke="none" />
    </svg>
  );
}

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  argTypes: { size: { control: 'inline-radio', options: ['page', 'inline'] } },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FirstUse: Story = {
  args: {
    title: 'No services yet',
    description: 'Services deploy from a connected repository.',
    illustration: <RepoArt />,
    action: { label: 'Connect repository', onClick: () => {} },
    secondaryAction: { label: 'Learn more', onClick: () => {} },
  },
};

export const NoResults: Story = {
  args: {
    title: 'No results for “billing-eu”',
    description: 'Try a different query or clear your filters.',
    action: { label: 'Clear filters', onClick: () => {} },
  },
};

export const Inline: Story = {
  args: {
    size: 'inline',
    title: 'No members match',
    description: 'Adjust the search to find people.',
    action: { label: 'Clear', onClick: () => {} },
  },
};
