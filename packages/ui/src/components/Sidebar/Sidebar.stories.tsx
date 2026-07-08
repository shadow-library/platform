/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Badge } from '../Badge';
import { Sidebar, useSidebar } from './Sidebar';

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

// A compact identity mark — the monogram stays visible (centered) in rail; the label only shows expanded.
function WorkspaceMark() {
  const { collapsed } = useSidebar();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          flexShrink: 0,
          borderRadius: 6,
          background: 'var(--sh-accent)',
          color: 'var(--sh-on-accent)',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        A
      </span>
      {!collapsed ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>acme-prod</span> : null}
    </span>
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
          workspace={<WorkspaceMark />}
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
