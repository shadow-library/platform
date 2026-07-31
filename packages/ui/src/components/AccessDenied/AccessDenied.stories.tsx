/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { AccessDenied } from './AccessDenied';

/**
 * Declaring the constants
 */
function LockArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="26" y="44" width="44" height="32" rx="6" />
      <path d="M36 44v-8a12 12 0 0 1 24 0v8" strokeLinecap="round" />
      <circle cx="48" cy="60" r="3.5" fill="var(--sh-accent)" stroke="none" />
    </svg>
  );
}

const meta = {
  title: 'Components/AccessDenied',
  component: AccessDenied,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AccessDenied>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The case worth designing for: the application is named, so the ask is concrete. */
export const NamedApplication: Story = {
  args: {
    application: 'Pulse',
    illustration: <LockArt />,
    action: { label: 'Back to sign in', onClick: () => {} },
  },
};

export const UnknownApplication: Story = {
  args: {
    illustration: <LockArt />,
    action: { label: 'Back to sign in', onClick: () => {} },
  },
};

/** What a user pastes into a support ticket when the copy has not helped them. */
export const WithDiagnostics: Story = {
  args: {
    application: 'Pulse',
    error: 'access_denied',
    requestId: '9f2c1b7e-4d0a-4f77-9d5b-2c8a6e1f3b40',
    action: { label: 'Back to sign in', onClick: () => {} },
    secondaryAction: { label: 'Contact support', onClick: () => {} },
  },
};
