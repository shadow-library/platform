/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { ActionSheet } from './ActionSheet';

/**
 * Declaring the constants
 */
function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6.5h3l1.5-2h5L14 6.5h3v9H3z" />
      <circle cx="10" cy="10.5" r="2.8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 5h5l1.5 2h8.5v8.5h-15z" />
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

const meta = {
  title: 'Components/ActionSheet',
  component: ActionSheet,
  parameters: { layout: 'centered' },
  argTypes: { children: { control: false }, open: { control: false } },
} satisfies Meta<typeof ActionSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { open: false, onOpenChange: () => undefined, children: null },
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add attachment</Button>
        <ActionSheet open={open} onOpenChange={setOpen} title="Add attachment">
          <ActionSheet.Item icon={<CameraIcon />}>Take photo</ActionSheet.Item>
          <ActionSheet.Item icon={<FolderIcon />}>Browse files</ActionSheet.Item>
        </ActionSheet>
      </>
    );
  },
};

/** Destructive actions read the danger intent and sit apart from the safe ones. */
export const Destructive: Story = {
  args: { open: false, onOpenChange: () => undefined, children: null },
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Manage photo</Button>
        <ActionSheet open={open} onOpenChange={setOpen} title="Photo options" description="Applies only to this photo.">
          <ActionSheet.Item icon={<FolderIcon />}>Move to album</ActionSheet.Item>
          <ActionSheet.Group>
            <ActionSheet.Item icon={<TrashIcon />} intent="danger">
              Delete photo
            </ActionSheet.Item>
          </ActionSheet.Group>
        </ActionSheet>
      </>
    );
  },
};

/** Groups separate related rows under an optional caption. */
export const Grouped: Story = {
  args: { open: false, onOpenChange: () => undefined, children: null },
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Share</Button>
        <ActionSheet open={open} onOpenChange={setOpen} aria-label="Share">
          <ActionSheet.Group label="Send">
            <ActionSheet.Item>Message</ActionSheet.Item>
            <ActionSheet.Item>Mail</ActionSheet.Item>
          </ActionSheet.Group>
          <ActionSheet.Group label="Link">
            <ActionSheet.Item>Copy link</ActionSheet.Item>
          </ActionSheet.Group>
        </ActionSheet>
      </>
    );
  },
};
