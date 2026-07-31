/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { Fab } from './Fab';

/**
 * Declaring the constants
 */
function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.5 2.5l2 2L6 12l-2.7.7L4 10z" />
    </svg>
  );
}

/** `transform` promotes the frame to a containing block, so `position: fixed` placements land inside it. */
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
  title: 'Components/Fab',
  component: Fab,
  parameters: { layout: 'centered' },
  args: { icon: <PlusIcon />, 'aria-label': 'Add', variant: 'primary', size: 'md', placement: 'static' },
  argTypes: {
    icon: { control: false },
    variant: { control: 'inline-radio', options: ['primary', 'secondary'] },
    size: { control: 'inline-radio', options: ['md', 'lg'] },
    placement: { control: 'select', options: ['bottom-end', 'bottom-center', 'bottom-start', 'static'] },
  },
} satisfies Meta<typeof Fab>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — adjust props from the controls panel. */
export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Fab icon={<PlusIcon />} aria-label="Add" placement="static" />
      <Fab icon={<PlusIcon />} aria-label="Add" variant="secondary" placement="static" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Fab icon={<PlusIcon />} aria-label="Add" size="md" placement="static" />
      <Fab icon={<PlusIcon />} aria-label="Add" size="lg" placement="static" />
    </div>
  ),
};

/** A `label` extends the FAB into a pill — no `aria-label` needed. */
export const Extended: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Fab icon={<PenIcon />} label="Compose" placement="static" />
      <Fab icon={<PenIcon />} label="Compose" variant="secondary" size="lg" placement="static" />
    </div>
  ),
};

/** Fixed placements float past the safe areas — shown inside a containing frame. */
export const Floating: Story = {
  render: () => (
    <PhoneFrame>
      <Fab icon={<PenIcon />} label="Compose" placement="bottom-end" />
    </PhoneFrame>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};
