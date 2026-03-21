/**
 * Importing npm packages
 */
import { Button, Group, HoverCard, Menu, Popover, Text, Tooltip } from '@mantine/core';
import { Bell, Pencil, Trash2 } from 'lucide-react';

/**
 * Importing user defined packages
 */
import { preview } from '../preview';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const meta = preview.meta({
  title: 'Mantine Showcase/Overlays',
  parameters: { layout: 'padded' },
});

export const Tooltips = meta.story({
  render: () => (
    <Group>
      <Tooltip label='This is a tooltip'>
        <Button variant='light'>Hover for tooltip</Button>
      </Tooltip>
      <Tooltip label='Tooltip on top' position='top'>
        <Button variant='light'>Top</Button>
      </Tooltip>
    </Group>
  ),
});

export const HoverCards = meta.story({
  render: () => (
    <HoverCard width={280} shadow='md'>
      <HoverCard.Target>
        <Button variant='subtle'>Hover for card</Button>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Text size='sm'>This dropdown appears on hover. Styled with your custom theme.</Text>
      </HoverCard.Dropdown>
    </HoverCard>
  ),
});

export const Popovers = meta.story({
  render: () => (
    <Popover width={220} position='bottom' withArrow shadow='md'>
      <Popover.Target>
        <Button variant='light'>Click for popover</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size='sm'>Popover content — also theme-aware.</Text>
      </Popover.Dropdown>
    </Popover>
  ),
});

export const Menus = meta.story({
  render: () => (
    <Menu shadow='md' width={200}>
      <Menu.Target>
        <Button variant='light'>Open menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Actions</Menu.Label>
        <Menu.Item leftSection={<Pencil size={14} />}>Edit</Menu.Item>
        <Menu.Item leftSection={<Bell size={14} />}>Notifications</Menu.Item>
        <Menu.Divider />
        <Menu.Item color='red' leftSection={<Trash2 size={14} />}>
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
});
