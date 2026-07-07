/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { Drawer } from './Drawer';
import { type DrawerPlacement } from './Drawer.types';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Drawer',
  component: Drawer,
  parameters: { layout: 'fullscreen' },
  args: { open: false },
} satisfies Meta<typeof Drawer>;

export default meta;

type Story = StoryObj<typeof meta>;

function Demo({ modal, placement }: { modal: boolean; placement: DrawerPlacement }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <Button onClick={() => setOpen(true)}>Open drawer</Button>
      <Drawer open={open} onOpenChange={setOpen} modal={modal} placement={placement}>
        <Drawer.Header title='checkout-service' meta='Deploy 7f3a · main · v2.14.0' />
        <Drawer.Body>
          <p style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', margin: 0 }}>
            Detail content for the selected record. In non-modal mode the page stays interactive; selecting another row swaps this content in place.
          </p>
        </Drawer.Body>
        <Drawer.Footer cancel='View logs' action='Promote' onAction={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}

export const ModalRight: Story = { render: () => <Demo modal placement='right' /> };
export const NonModalRight: Story = { render: () => <Demo modal={false} placement='right' /> };
export const Left: Story = { render: () => <Demo modal placement='left' /> };
export const Bottom: Story = { render: () => <Demo modal placement='bottom' /> };
