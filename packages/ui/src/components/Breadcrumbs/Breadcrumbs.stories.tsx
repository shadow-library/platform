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

export const LongLabels: Story = {
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="#org" title="Shadow Platform Engineering Organization">
          Shadow Platform Engineering Organization
        </Breadcrumbs.Item>
        <Breadcrumbs.Item href="#bots">Bots</Breadcrumbs.Item>
        <Breadcrumbs.Item current title="webnovel-ingest-pipeline-production-worker">
          webnovel-ingest-pipeline-production-worker
        </Breadcrumbs.Item>
      </Breadcrumbs>
    </div>
  ),
};

export const AncestorsHiddenOnNarrowScreens: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <Breadcrumbs hideAncestorsBelow="sm">
      <Breadcrumbs.Item href="#org">Shadow Platform</Breadcrumbs.Item>
      <Breadcrumbs.Item href="#bots">Bots</Breadcrumbs.Item>
      <Breadcrumbs.Item current>webnovel-ingest</Breadcrumbs.Item>
    </Breadcrumbs>
  ),
};
