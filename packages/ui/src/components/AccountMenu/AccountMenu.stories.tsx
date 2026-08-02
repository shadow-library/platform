/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { AccountMenu } from './AccountMenu';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/AccountMenu',
  component: AccountMenu,
  parameters: { layout: 'centered' },
  args: { name: 'Ada Lovelace', email: 'ada@shadow.app', onSignOut: () => undefined },
} satisfies Meta<typeof AccountMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The minimum: identity plus a way out. */
export const SignOutOnly: Story = {
  args: { items: undefined },
};

/** App-specific rows sit above the sign-out separator, in the order given. */
export const WithItems: Story = {
  args: {
    items: [
      { id: 'projects', label: 'All projects', onSelect: () => undefined },
      { id: 'settings', label: 'Settings', onSelect: () => undefined },
    ],
  },
};

/** A profile that failed to load still has a session — the menu falls back to "Account". */
export const NameUnavailable: Story = {
  args: { name: undefined, email: undefined },
};

/** No session: a call to action replaces the avatar entirely. */
export const SignedOut: Story = {
  args: { signedOut: { href: '/login' } },
};
