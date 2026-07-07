/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Badge } from '../Badge';
import { Sidebar } from './Sidebar';

/**
 * Declaring the constants
 */
function Dot() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor' aria-hidden='true'>
      <circle cx='8' cy='8' r='4' />
    </svg>
  );
}

const meta = {
  title: 'Components/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Sidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <div style={{ display: 'flex', height: 480 }}>
        <Sidebar
          workspace='acme-prod'
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          footer={
            <Sidebar.Item href='#account' icon={<Dot />}>
              Account
            </Sidebar.Item>
          }
        >
          <Sidebar.Section label='Platform'>
            <Sidebar.Item href='#services' icon={<Dot />} active>
              Services
            </Sidebar.Item>
            <Sidebar.Item
              href='#deploys'
              icon={<Dot />}
              badge={
                <Badge variant='count' intent='neutral'>
                  3
                </Badge>
              }
            >
              Deploys
            </Sidebar.Item>
            <Sidebar.Group label='Settings' icon={<Dot />}>
              <Sidebar.Item href='#general'>General</Sidebar.Item>
              <Sidebar.Item href='#members'>Members</Sidebar.Item>
            </Sidebar.Group>
          </Sidebar.Section>
        </Sidebar>
        <div style={{ flex: 1, padding: 24, color: 'var(--sh-text-tertiary)' }}>Content region</div>
      </div>
    );
  },
};
