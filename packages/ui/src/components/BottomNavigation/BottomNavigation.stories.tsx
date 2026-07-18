/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type ReactNode, useState } from 'react';

/**
 * Importing user defined packages
 */
import { Badge } from '../Badge';
import { BottomNavigation } from './BottomNavigation';

/**
 * Declaring the constants
 */
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5L12 4l8 6.5V20h-5.5v-5h-5v5H4z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13l3-8h12l3 8v6H3z" />
      <path d="M3 13h5a4 4 0 008 0h5" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}

/** `transform` promotes the frame to a containing block, so the fixed bar lands inside it. */
const phoneFrame: CSSProperties = {
  position: 'relative',
  width: 320,
  height: 360,
  overflow: 'hidden',
  transform: 'translateZ(0)',
  border: '1px solid var(--sh-border-default)',
  borderRadius: 12,
  background: 'var(--sh-surface-app)',
};

function PhoneFrame({ children }: { children: ReactNode }) {
  return <div style={phoneFrame}>{children}</div>;
}

const meta = {
  title: 'Components/BottomNavigation',
  component: BottomNavigation,
  parameters: { layout: 'centered' },
  args: { fixed: false, children: null },
  argTypes: { children: { control: false } },
} satisfies Meta<typeof BottomNavigation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <div style={{ width: 360 }}>
      <BottomNavigation {...args} defaultValue="home" aria-label="Primary">
        <BottomNavigation.Item value="home" icon={<HomeIcon />} label="Home" />
        <BottomNavigation.Item value="search" icon={<SearchIcon />} label="Search" />
        <BottomNavigation.Item value="inbox" icon={<InboxIcon />} label="Inbox" />
        <BottomNavigation.Item value="profile" icon={<ProfileIcon />} label="Profile" />
      </BottomNavigation>
    </div>
  ),
};

/** A count `Badge` overlays the destination icon. */
export const WithBadge: Story = {
  render: args => (
    <div style={{ width: 360 }}>
      <BottomNavigation {...args} defaultValue="inbox">
        <BottomNavigation.Item value="home" icon={<HomeIcon />} label="Home" />
        <BottomNavigation.Item value="inbox" icon={<InboxIcon />} label="Inbox" badge={<Badge intent="danger">12</Badge>} />
        <BottomNavigation.Item value="profile" icon={<ProfileIcon />} label="Profile" />
      </BottomNavigation>
    </div>
  ),
};

/** Controlled selection — the bar reports taps and the owner decides the active destination. */
export const Controlled: Story = {
  render: args => {
    const [value, setValue] = useState('home');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 360 }}>
        <p style={{ margin: 0, font: 'var(--sh-text-body) / var(--sh-text-body--line-height) var(--sh-font-sans)', color: 'var(--sh-text-secondary)' }}>Active: {value}</p>
        <BottomNavigation {...args} value={value} onValueChange={setValue}>
          <BottomNavigation.Item value="home" icon={<HomeIcon />} label="Home" />
          <BottomNavigation.Item value="search" icon={<SearchIcon />} label="Search" />
          <BottomNavigation.Item value="profile" icon={<ProfileIcon />} label="Profile" />
        </BottomNavigation>
      </div>
    );
  },
};

/** The default fixed bar pinned to the bottom edge — shown inside a containing frame. */
export const Fixed: Story = {
  render: () => (
    <PhoneFrame>
      <BottomNavigation defaultValue="home">
        <BottomNavigation.Item value="home" icon={<HomeIcon />} label="Home" />
        <BottomNavigation.Item value="search" icon={<SearchIcon />} label="Search" />
        <BottomNavigation.Item value="inbox" icon={<InboxIcon />} label="Inbox" badge={<Badge intent="danger">3</Badge>} />
        <BottomNavigation.Item value="profile" icon={<ProfileIcon />} label="Profile" />
      </BottomNavigation>
    </PhoneFrame>
  ),
};
