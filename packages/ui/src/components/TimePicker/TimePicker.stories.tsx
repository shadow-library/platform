/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import { TimePicker } from './TimePicker';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/TimePicker',
  component: TimePicker,
  parameters: { layout: 'centered' },
  argTypes: { hour12: { control: 'boolean' }, size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
} satisfies Meta<typeof TimePicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TwelveHour: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('09:30');
    return <TimePicker value={value} onValueChange={setValue} aria-label="Doors open" />;
  },
};

export const TwentyFourHour: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('21:30');
    return <TimePicker value={value} onValueChange={setValue} hour12={false} step={15} aria-label="Cutoff" />;
  },
};

/** The suggestion list sits on the popover layer, above the modal it was opened from. */
export const InsideDialog: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('18:30');
    return (
      <Dialog>
        <Dialog.Trigger asChild>
          <Button>Reschedule</Button>
        </Dialog.Trigger>
        <Dialog.Content size="sm">
          <Dialog.Header title="Reschedule" />
          <Dialog.Body>
            <FormField label="Move to">
              <TimePicker value={value} onValueChange={setValue} hour12={false} />
            </FormField>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog>
    );
  },
};
