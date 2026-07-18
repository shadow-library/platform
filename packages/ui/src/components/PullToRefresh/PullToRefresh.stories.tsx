/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { PullToRefresh } from './PullToRefresh';

/**
 * Declaring the constants
 */
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function DemoList({ stamp }: { stamp: string }) {
  return (
    <ul style={{ margin: 0, padding: 16, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <li style={{ color: 'var(--sh-text-tertiary)', fontSize: 12 }}>Updated {stamp}</li>
      {Array.from({ length: 12 }, (_, index) => (
        <li
          key={index}
          style={{
            padding: 12,
            background: 'var(--sh-surface-card)',
            border: '1px solid var(--sh-border-default)',
            borderRadius: 8,
            color: 'var(--sh-text-primary)',
            fontSize: 13,
          }}
        >
          Conversation {index + 1}
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: 'Components/PullToRefresh',
  component: PullToRefresh,
  parameters: { layout: 'centered' },
  argTypes: { children: { control: false }, onRefresh: { control: false } },
} satisfies Meta<typeof PullToRefresh>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Drag the list down from the top (or Tab to the hidden Refresh affordance) to trigger a 1.5s refresh. */
export const Default: Story = {
  args: { onRefresh: () => undefined, children: null },
  render: () => {
    const [stamp, setStamp] = useState('just now');
    return (
      <div style={{ width: 320, height: 400, overflow: 'hidden', border: '1px solid var(--sh-border-default)', borderRadius: 12, background: 'var(--sh-surface-app)' }}>
        <PullToRefresh
          style={{ height: '100%' }}
          onRefresh={async () => {
            await wait(1500);
            setStamp(new Date().toLocaleTimeString());
          }}
        >
          <DemoList stamp={stamp} />
        </PullToRefresh>
      </div>
    );
  },
};

export const Disabled: Story = {
  args: { onRefresh: () => undefined, children: null },
  render: () => (
    <div style={{ width: 320, height: 240, overflow: 'hidden', border: '1px solid var(--sh-border-default)', borderRadius: 12, background: 'var(--sh-surface-app)' }}>
      <PullToRefresh style={{ height: '100%' }} onRefresh={() => undefined} disabled>
        <DemoList stamp="never" />
      </PullToRefresh>
    </div>
  ),
};
