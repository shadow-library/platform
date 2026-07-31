/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { type CSSProperties, useState } from 'react';

/**
 * Importing user defined packages
 */
import { SwipeActions } from './SwipeActions';

/**
 * Declaring the constants
 */
function ArchiveIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h14v3H3zM4.5 8v7h11V8M8.5 11h3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5h12M8 5.5V4h4v1.5M6 5.5l.7 10h6.6l.7-10" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h4l.5 5 2 2v1.5h-9V10l2-2zM10 11.5V17" />
    </svg>
  );
}

const rowBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 16px' };
const rowTitle: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--sh-text-primary)' };
const rowMeta: CSSProperties = { fontSize: 12, color: 'var(--sh-text-tertiary)' };
const listFrame: CSSProperties = { width: 340, border: '1px solid var(--sh-border-default)', borderRadius: 12, overflow: 'hidden', background: 'var(--sh-surface-card)' };

function Row({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={rowBody}>
      <span style={rowTitle}>{title}</span>
      <span style={rowMeta}>{meta}</span>
    </div>
  );
}

const meta = {
  title: 'Components/SwipeActions',
  component: SwipeActions,
  parameters: { layout: 'centered' },
  argTypes: { children: { control: false }, leading: { control: false }, trailing: { control: false } },
} satisfies Meta<typeof SwipeActions>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Drag the row left (or focus it and press ArrowLeft) to reveal the trailing actions. */
export const Default: Story = {
  args: { children: null },
  render: () => (
    <div style={listFrame}>
      <SwipeActions
        trailing={
          <>
            <SwipeActions.Action intent="neutral">
              <ArchiveIcon />
              Archive
            </SwipeActions.Action>
            <SwipeActions.Action intent="danger">
              <TrashIcon />
              Delete
            </SwipeActions.Action>
          </>
        }
      >
        <Row title="Weekly report" meta="Anna · 2h ago" />
      </SwipeActions>
    </div>
  ),
};

/** Leading and trailing rails together — ArrowRight reveals the leading rail. */
export const BothRails: Story = {
  args: { children: null },
  render: () => (
    <div style={listFrame}>
      <SwipeActions
        leading={
          <SwipeActions.Action intent="info">
            <PinIcon />
            Pin
          </SwipeActions.Action>
        }
        trailing={
          <SwipeActions.Action intent="danger">
            <TrashIcon />
            Delete
          </SwipeActions.Action>
        }
      >
        <Row title="Design sync notes" meta="Priya · yesterday" />
      </SwipeActions>
    </div>
  ),
};

/** `fullSwipe` commits the rail's first action when the swipe crosses 60% of the row. */
export const FullSwipeToDelete: Story = {
  args: { children: null },
  render: () => {
    const [items, setItems] = useState(['Standup recording', 'Quarterly plan', 'Retro board']);
    return (
      <div style={listFrame}>
        {items.map(item => (
          <SwipeActions
            key={item}
            fullSwipe
            trailing={
              <SwipeActions.Action intent="danger" onClick={() => setItems(current => current.filter(other => other !== item))}>
                <TrashIcon />
                Delete
              </SwipeActions.Action>
            }
          >
            <Row title={item} meta="Swipe fully to delete" />
          </SwipeActions>
        ))}
      </div>
    );
  },
};

/** Controlled — the owner decides which rail is open. */
export const Controlled: Story = {
  args: { children: null },
  render: () => {
    const [open, setOpen] = useState<'leading' | 'trailing' | null>('trailing');
    return (
      <div style={listFrame}>
        <SwipeActions
          open={open}
          onOpenChange={setOpen}
          trailing={
            <SwipeActions.Action intent="neutral">
              <ArchiveIcon />
              Archive
            </SwipeActions.Action>
          }
        >
          <Row title="Open by default" meta="The trailing rail starts revealed" />
        </SwipeActions>
      </div>
    );
  },
};
