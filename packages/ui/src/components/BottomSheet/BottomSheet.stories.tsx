/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { BottomSheet } from './BottomSheet';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/BottomSheet',
  component: BottomSheet,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onOpenChange: () => {}, children: null },
} satisfies Meta<typeof BottomSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: 24 }}>
        <Button onClick={() => setOpen(true)}>Open sheet</Button>
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title='Filter results'
          headerAction={
            <Button variant='text' size='sm'>
              Reset
            </Button>
          }
          footer={
            <Button size='lg' fullWidth>
              Show 24 results
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <label key={`row-${i}`} style={{ display: 'flex', gap: 8 }}>
                <input type='checkbox' /> Option {i + 1}
              </label>
            ))}
          </div>
        </BottomSheet>
      </div>
    );
  },
};

export const MultiSnap: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: 24 }}>
        <Button onClick={() => setOpen(true)}>Open multi-snap sheet</Button>
        <BottomSheet open={open} onOpenChange={setOpen} title='Details' snapPoints={['content', 'half', 'full']} defaultSnap='half'>
          <p style={{ margin: 0 }}>Drag the grabber or click it to cycle content → half → full.</p>
        </BottomSheet>
      </div>
    );
  },
};

export const NonDismissable: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: 24 }}>
        <Button onClick={() => setOpen(true)}>Open required sheet</Button>
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title='Confirm your plan'
          dismissable={false}
          footer={
            <Button size='lg' fullWidth onClick={() => setOpen(false)}>
              Continue
            </Button>
          }
        >
          <p style={{ margin: 0 }}>Scrim taps and Esc do nothing — an explicit action is required.</p>
        </BottomSheet>
      </div>
    );
  },
};
