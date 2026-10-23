import { type Meta, type StoryObj } from '@storybook/react-vite';

import { AccountMenu } from './AccountMenu';

const meta = {
  title: 'Components/AccountMenu',
  component: AccountMenu,
  parameters: { layout: 'centered' },
  args: { name: 'Ada Lovelace', email: 'ada@shadow.app', onSignOut: () => undefined },
} satisfies Meta<typeof AccountMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SignOutOnly: Story = {
  args: { items: undefined },
};

export const WithItems: Story = {
  args: {
    items: [
      { id: 'projects', label: 'All projects', onSelect: () => undefined },
      { id: 'settings', label: 'Settings', onSelect: () => undefined },
    ],
  },
};

export const NameUnavailable: Story = {
  args: { name: undefined, email: undefined },
};

export const SignedOut: Story = {
  args: { signedOut: { href: '/login' } },
};
