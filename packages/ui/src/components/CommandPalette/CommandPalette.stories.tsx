/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { CommandPalette } from './CommandPalette';
import { type CommandItem } from './CommandPalette.types';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/CommandPalette',
  component: CommandPalette,
  parameters: { layout: 'fullscreen' },
  args: { commands: [] },
} satisfies Meta<typeof CommandPalette>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const commands: CommandItem[] = [
      { id: 'restart', group: 'Actions', label: 'Restart service', shortcut: 'mod+shift+R', meta: 'Restarts the service', onRun: () => {} },
      { id: 'deploy', group: 'Actions', label: 'Deploy latest', shortcut: 'mod+shift+D', onRun: () => {} },
      { id: 'settings', group: 'Pages', label: 'Open settings', onRun: () => {} },
      { id: 'members', group: 'Pages', label: 'Members', keywords: ['team', 'people'], onRun: () => {} },
      { id: 'logs', group: 'Records', label: 'View logs', onRun: () => {} },
    ];
    return (
      <div style={{ padding: 24 }}>
        <Button onClick={() => setOpen(true)}>Open palette (or press ⌘K)</Button>
        <CommandPalette open={open} onOpenChange={setOpen} commands={commands} />
      </div>
    );
  },
};
