/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { Toaster } from './Toast';
import { toast } from './Toast.store';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Toast',
  component: Toaster,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Spawn toasts through the imperative API; the Toaster lives once at the app root. */
export const Playground: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Button variant='secondary' onClick={() => toast.success('Environment created')}>
        Success
      </Button>
      <Button variant='secondary' onClick={() => toast.danger('Deploy failed', { body: 'Build step 3 exited with code 1.', action: { label: 'View logs', onClick: () => {} } })}>
        Error
      </Button>
      <Button variant='secondary' onClick={() => toast.warning('Imported 98 of 100 rows')}>
        Warning
      </Button>
      <Button variant='secondary' onClick={() => toast.success('Workspace deleted', { action: { label: 'Undo', onClick: () => {} } })}>
        With action
      </Button>
      <Button
        variant='secondary'
        onClick={() => toast.promise(new Promise(resolve => setTimeout(resolve, 1500)), { loading: 'Deploying…', success: 'Deployed', error: 'Deploy failed' })}
      >
        Promise
      </Button>
      <Toaster />
    </div>
  ),
};
