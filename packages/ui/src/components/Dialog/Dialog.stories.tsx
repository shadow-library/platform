/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { FormField } from '../FormField';
import { Input } from '../Input';
import { ConfirmDialog, Dialog } from './Dialog';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Task dialog — a form the user finishes or abandons. */
export const Task: Story = {
  render: () => (
    <Dialog>
      <Dialog.Trigger asChild>
        <Button>New environment</Button>
      </Dialog.Trigger>
      <Dialog.Content size='sm'>
        <Dialog.Header title='New environment' description='Environments isolate config and secrets per deploy target.' />
        <Dialog.Body>
          <FormField label='Name'>
            <Input placeholder='staging-eu' />
          </FormField>
        </Dialog.Body>
        <Dialog.Footer cancel='Cancel' action='Create environment' onAction={() => {}} />
      </Dialog.Content>
    </Dialog>
  ),
};

/** Destructive confirm — Danger primary, gated by typing the resource name. */
export const DestructiveConfirm: Story = {
  render: () => (
    <ConfirmDialog
      trigger={<Button variant='danger'>Delete workspace…</Button>}
      intent='danger'
      title='Delete workspace?'
      description='This permanently deletes acme-prod, its 14 projects, and all deploy history. This cannot be undone.'
      confirmLabel='Delete workspace'
      typedConfirmation='acme-prod'
      onConfirm={() => {}}
    />
  ),
};

/** A plain confirm without typed gating. */
export const Confirm: Story = {
  render: () => (
    <ConfirmDialog
      trigger={<Button variant='secondary'>Archive project</Button>}
      title='Archive project?'
      description='You can restore it from the archive within 30 days.'
      confirmLabel='Archive'
      onConfirm={() => {}}
    />
  ),
};
