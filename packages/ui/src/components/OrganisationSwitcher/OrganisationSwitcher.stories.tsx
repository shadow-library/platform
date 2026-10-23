import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { OrganisationSwitcher } from './OrganisationSwitcher';

const ORGANISATIONS = [
  { id: 'platform', name: 'Platform' },
  { id: 'acme', name: 'Acme Publishing' },
  { id: 'personal', name: 'Ada Lovelace' },
];

const meta = {
  title: 'Components/OrganisationSwitcher',
  component: OrganisationSwitcher,
  parameters: { layout: 'centered' },
  args: { organisations: ORGANISATIONS, activeId: 'platform', onSwitch: () => undefined },
} satisfies Meta<typeof OrganisationSwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: args => {
    const [activeId, setActiveId] = useState(args.activeId);
    return <OrganisationSwitcher {...args} activeId={activeId} onSwitch={setActiveId} />;
  },
};

export const Switching: Story = {
  args: { switching: true },
};
