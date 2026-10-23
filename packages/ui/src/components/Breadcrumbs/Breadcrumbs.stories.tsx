import { type Meta, type StoryObj } from '@storybook/react-vite';

import { Breadcrumbs } from './Breadcrumbs';

const meta = {
  title: 'Components/Breadcrumbs',
  component: Breadcrumbs,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Breadcrumbs>
      <Breadcrumbs.Item href="#workspaces">Workspaces</Breadcrumbs.Item>
      <Breadcrumbs.Item href="#acme">acme-prod</Breadcrumbs.Item>
      <Breadcrumbs.Item href="#services">Services</Breadcrumbs.Item>
      <Breadcrumbs.Item current>checkout-service</Breadcrumbs.Item>
    </Breadcrumbs>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <Breadcrumbs maxVisible={4}>
      <Breadcrumbs.Item href="#org">Organization</Breadcrumbs.Item>
      <Breadcrumbs.Item href="#workspaces">Workspaces</Breadcrumbs.Item>
      <Breadcrumbs.Item href="#acme">acme-prod</Breadcrumbs.Item>
      <Breadcrumbs.Item href="#services">Services</Breadcrumbs.Item>
      <Breadcrumbs.Item current>checkout-service</Breadcrumbs.Item>
    </Breadcrumbs>
  ),
};
