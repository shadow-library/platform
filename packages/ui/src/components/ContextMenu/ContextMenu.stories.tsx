/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { ContextMenu } from './ContextMenu';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/ContextMenu',
  component: ContextMenu,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ContextMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

const Target = () => (
  <div
    style={{
      display: 'grid',
      placeItems: 'center',
      width: 320,
      height: 200,
      border: '1px dashed var(--sh-border-strong)',
      borderRadius: 8,
      color: 'var(--sh-text-tertiary)',
      fontSize: 13,
    }}
  >
    Right-click anywhere
  </div>
);

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenu.Trigger>
        <Target />
      </ContextMenu.Trigger>
      <ContextMenu.Content aria-label='File actions'>
        <ContextMenu.Item shortcut='⌘O'>Open</ContextMenu.Item>
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger>Open with</ContextMenu.SubTrigger>
          <ContextMenu.SubContent>
            <ContextMenu.Item>Preview</ContextMenu.Item>
            <ContextMenu.Item>Text editor</ContextMenu.Item>
            <ContextMenu.Item>Browser</ContextMenu.Item>
          </ContextMenu.SubContent>
        </ContextMenu.Sub>
        <ContextMenu.Separator />
        <ContextMenu.Item shortcut='⌘C'>Copy</ContextMenu.Item>
        <ContextMenu.Item shortcut='⌘V'>Paste</ContextMenu.Item>
        <ContextMenu.Item shortcut='F2'>Rename</ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item destructive shortcut='⌘⌫'>
          Delete
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  ),
};
