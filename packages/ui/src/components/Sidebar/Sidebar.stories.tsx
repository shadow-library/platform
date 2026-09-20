/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Badge } from '../Badge';
import { IconButton } from '../IconButton';
import { Sidebar, useSidebar } from './Sidebar';

/**
 * Declaring the constants
 */
function Dot() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="4" />
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

function Plus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" />
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
          workspace={<WorkspaceMark />}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          footer={
            <Sidebar.Item href="#account" icon={<Dot />}>
              Account
            </Sidebar.Item>
          }
        >
          <Sidebar.Section label="Platform">
            <Sidebar.Item href="#services" icon={<Dot />} active>
              Services
            </Sidebar.Item>
            <Sidebar.Item
              href="#deploys"
              icon={<Dot />}
              badge={
                <Badge variant="count" intent="neutral">
                  3
                </Badge>
              }
            >
              Deploys
            </Sidebar.Item>
            <Sidebar.Group label="Settings" icon={<Dot />}>
              <Sidebar.Item href="#general">General</Sidebar.Item>
              <Sidebar.Item href="#members">Members</Sidebar.Item>
            </Sidebar.Group>
          </Sidebar.Section>
        </Sidebar>
        <div style={{ flex: 1, padding: 24, color: 'var(--sh-text-tertiary)' }}>Content region</div>
      </div>
    );
  },
};

/**
 * `asChild` renders the caller's own element — a router `Link` in a real app — as the item, so navigation
 * keeps the router's client-side handling, prefetch and `aria-current`. The caller's children are rewrapped
 * in the label span, so the markup is identical to the plain-anchor branch.
 */
export const RouterLinks: Story = {
  render: () => (
    <div style={{ display: 'flex', height: 320 }}>
      <Sidebar workspace={<WorkspaceMark />}>
        <Sidebar.Section label="Platform">
          {/* No `active` prop — the link marks itself, exactly as a router link does when it matches. */}
          <Sidebar.Item asChild icon={<Dot />}>
            <a href="#services" data-status="active">
              Services
            </a>
          </Sidebar.Item>
          <Sidebar.Item asChild icon={<Dot />}>
            <a href="#deploys">Deploys</a>
          </Sidebar.Item>
        </Sidebar.Section>
      </Sidebar>
      <div style={{ flex: 1, padding: 24, color: 'var(--sh-text-tertiary)' }}>Content region</div>
    </div>
  ),
};

/**
 * The project-scoped shape: a switcher directly under the brand, naming what every destination below it
 * resolves against. Firebase's model — change the scope, keep the navigation.
 */
export const ProjectSwitcher: Story = {
  render: function ProjectSwitcherStory() {
    const projects = [
      { id: 'a', label: 'The Sunless Court', caption: 'source · #a', color: 'var(--sh-accent)' },
      { id: 'b', label: 'Ashes of Meridian', caption: 'new novel · #b', color: '#e0803a' },
      { id: 'c', label: 'Winterlight', caption: 'source · #c', color: '#3aa3e0' },
    ];
    const [current, setCurrent] = useState(projects[0]);
    return (
      <div style={{ display: 'flex', height: 380 }}>
        <Sidebar workspace={<WorkspaceMark />}>
          <Sidebar.Switcher
            current={current}
            options={projects}
            onSelect={id => setCurrent(projects.find(project => project.id === id))}
            footerAction={{ label: 'View all projects', onSelect: () => setCurrent(undefined) }}
          />
          <Sidebar.Section>
            <Sidebar.Item icon={<Dot />} href="#overview" active>
              Overview
            </Sidebar.Item>
            <Sidebar.Item icon={<Dot />} href="#chapters" badge={<Badge variant="count">12</Badge>}>
              Chapters
            </Sidebar.Item>
            <Sidebar.Item icon={<Dot />} href="#publish">
              Publish
            </Sidebar.Item>
          </Sidebar.Section>
        </Sidebar>
        <div style={{ flex: 1, padding: 24, color: 'var(--sh-text-tertiary)' }}>Content region</div>
      </div>
    );
  },
};

/**
 * A screen that owns a list — conversations, saved views — nests it under its own destination rather than
 * opening a second column. The header stays navigable, the disclosure moves to its own chevron, and the
 * action starts a new one without going through the screen first. In rail mode the flyout carries all three.
 */
export const NestedDestinations: Story = {
  render: () => (
    <div style={{ display: 'flex', height: 380 }}>
      <Sidebar workspace={<WorkspaceMark />}>
        <Sidebar.Section>
          <Sidebar.Item icon={<Dot />} href="#overview">
            Overview
          </Sidebar.Item>
          <Sidebar.Group
            label="Refinement Chat"
            icon={<Dot />}
            defaultOpen
            link={
              <a href="#chat" data-status="active">
                Refinement Chat
              </a>
            }
            action={<IconButton size="sm" variant="ghost" aria-label="New chat" icon={<Plus />} />}
          >
            <Sidebar.Item href="#chat-a">The betrayal at Meridian Gate</Sidebar.Item>
            <Sidebar.Item href="#chat-b">Naming the second volume</Sidebar.Item>
            <Sidebar.Item href="#chat-c">Timeline audit</Sidebar.Item>
            <Sidebar.Item href="#chat-all">All 14 chats</Sidebar.Item>
          </Sidebar.Group>
          <Sidebar.Item icon={<Dot />} href="#publish">
            Publish
          </Sidebar.Item>
          {/* Outside a group there is no indent guide to sit under, so the row asks for the step itself. */}
          <Sidebar.Item href="#draft" indent>
            Untitled draft
          </Sidebar.Item>
        </Sidebar.Section>
      </Sidebar>
      <div style={{ flex: 1, padding: 24, color: 'var(--sh-text-tertiary)' }}>Content region</div>
    </div>
  ),
};
