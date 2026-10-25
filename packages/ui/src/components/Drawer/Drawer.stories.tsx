import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from '../Button';
import { ConfirmDialog } from '../Dialog';
import { FormField } from '../FormField';
import { Select } from '../Select';
import { Drawer } from './Drawer';
import { type DrawerPlacement } from './Drawer.types';

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
        <Drawer.Header title="checkout-service" meta="Deploy 7f3a · main · v2.14.0" />
        <Drawer.Body>
          <p style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', margin: 0 }}>
            Detail content for the selected record. In non-modal mode the page stays interactive; selecting another row swaps this content in place.
          </p>
        </Drawer.Body>
        <Drawer.Footer cancel="View logs" action="Promote" onAction={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}

export const ModalRight: Story = { render: () => <Demo modal placement="right" /> };
export const NonModalRight: Story = { render: () => <Demo modal={false} placement="right" /> };
export const Left: Story = { render: () => <Demo modal placement="left" /> };
export const Bottom: Story = { render: () => <Demo modal placement="bottom" /> };

function SelectInDrawerDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ padding: 24 }}>
      <Button onClick={() => setOpen(true)}>Open drawer</Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <Drawer.Header title="Effort" meta="How hard the model thinks before answering." />
        <Drawer.Body>
          <FormField label="Default">
            <Select defaultValue="low" aria-label="Default">
              <Select.Item value="none">None</Select.Item>
              <Select.Item value="low">Low</Select.Item>
              <Select.Item value="medium">Medium</Select.Item>
              <Select.Item value="high">High</Select.Item>
            </Select>
          </FormField>
        </Drawer.Body>
        <Drawer.Footer cancel="Cancel" action="Save to draft" onAction={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}

function ConfirmFromDrawerDemo() {
  const [open, setOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ padding: 24 }}>
      <Button onClick={() => setOpen(true)}>Open drawer</Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <Drawer.Header title="Edit budget" meta="Novel Forge — each user — per hour" />
        <Drawer.Body>
          <p style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', margin: 0 }}>Saving asks for confirmation; the drawer dims beneath it.</p>
        </Drawer.Body>
        <Drawer.Footer cancel="Cancel" action="Save" onAction={() => setConfirming(true)} />
      </Drawer>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Publish this budget change?"
        description="This takes effect for every app within a minute."
        confirmLabel="Publish"
        onConfirm={() => {
          setConfirming(false);
          setOpen(false);
        }}
      />
    </div>
  );
}

export const SelectInsideDrawer: Story = { name: 'Select inside Drawer', render: () => <SelectInDrawerDemo /> };
export const ConfirmFromDrawer: Story = { name: 'Confirm from Drawer', render: () => <ConfirmFromDrawerDemo /> };
