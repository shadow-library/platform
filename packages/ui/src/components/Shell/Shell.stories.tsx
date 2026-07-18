/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { Sidebar } from '../Sidebar';
import { TopNavigation } from '../TopNavigation';
import { Page, Shell } from './Shell';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Shell',
  component: Shell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Shell>;

export default meta;

type Story = StoryObj<typeof meta>;

const navLink = { display: 'block', padding: '6px 10px', borderRadius: 6, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', textDecoration: 'none' } as const;

const SidebarDemo = (
  <nav aria-label="Main" style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--sh-border-default)', padding: 16 }}>
    <div style={{ fontWeight: 600, fontSize: 'var(--sh-text-body-sm)', marginBottom: 16 }}>acme-prod</div>
    <a href="#services" style={{ ...navLink, background: 'var(--sh-accent-soft)', color: 'var(--sh-accent)' }} aria-current="page">
      Services
    </a>
    <a href="#deploys" style={navLink}>
      Deploys
    </a>
    <a href="#settings" style={navLink}>
      Settings
    </a>
  </nav>
);

const TopBarDemo = (
  <header
    style={{
      height: 56,
      flexShrink: 0,
      borderBottom: '1px solid var(--sh-border-default)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '0 24px',
      gap: 12,
    }}
  >
    <span style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>⌘K to search</span>
  </header>
);

export const Default: Story = {
  render: () => (
    <Shell sidebar={SidebarDemo} topbar={TopBarDemo}>
      <Page title="Services" description="Everything running in acme-prod" actions={<Button>New service</Button>}>
        <div
          style={{
            height: 400,
            borderRadius: 8,
            border: '1px dashed var(--sh-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--sh-text-tertiary)',
          }}
        >
          Page content
        </div>
      </Page>
    </Shell>
  ),
};

/**
 * Below the md breakpoint (768px) the shell hides the persistent sidebar automatically and
 * TopNavigation surfaces a hamburger that opens the same sidebar as a modal nav drawer.
 * Narrow the viewport (or use the viewport toolbar) to see the swap.
 */
export const ResponsiveNavigation: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <Shell
      sidebar={
        <Sidebar workspace="acme-prod">
          <Sidebar.Section label="Platform">
            <Sidebar.Item href="#services" active>
              Services
            </Sidebar.Item>
            <Sidebar.Item href="#deploys">Deploys</Sidebar.Item>
            <Sidebar.Item href="#logs">Logs</Sidebar.Item>
          </Sidebar.Section>
          <Sidebar.Section label="Admin">
            <Sidebar.Item href="#members">Members</Sidebar.Item>
            <Sidebar.Item href="#settings">Settings</Sidebar.Item>
          </Sidebar.Section>
        </Sidebar>
      }
      topbar={
        <TopNavigation brand="Acme">
          <TopNavigation.Item href="#overview" active>
            Overview
          </TopNavigation.Item>
        </TopNavigation>
      }
    >
      <Page title="Services" description="Resize below 768px for the drawer">
        <div
          style={{
            height: 320,
            borderRadius: 8,
            border: '1px dashed var(--sh-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--sh-text-tertiary)',
          }}
        >
          Page content
        </div>
      </Page>
    </Shell>
  ),
};

export const Dark: Story = {
  render: () => (
    <Shell theme="dark" sidebar={SidebarDemo} topbar={TopBarDemo}>
      <Page title="Services" description="Everything running in acme-prod" actions={<Button>New service</Button>}>
        <div
          style={{
            height: 400,
            borderRadius: 8,
            border: '1px dashed var(--sh-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--sh-text-tertiary)',
          }}
        >
          Page content
        </div>
      </Page>
    </Shell>
  ),
};
