/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
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
  <nav aria-label='Main' style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--sh-border-default)', padding: 16 }}>
    <div style={{ fontWeight: 600, fontSize: 'var(--sh-text-body-sm)', marginBottom: 16 }}>acme-prod</div>
    <a href='#services' style={{ ...navLink, background: 'var(--sh-accent-soft)', color: 'var(--sh-accent)' }} aria-current='page'>
      Services
    </a>
    <a href='#deploys' style={navLink}>
      Deploys
    </a>
    <a href='#settings' style={navLink}>
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
      <Page title='Services' description='Everything running in acme-prod' actions={<Button>New service</Button>}>
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

export const Dark: Story = {
  render: () => (
    <Shell theme='dark' sidebar={SidebarDemo} topbar={TopBarDemo}>
      <Page title='Services' description='Everything running in acme-prod' actions={<Button>New service</Button>}>
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
