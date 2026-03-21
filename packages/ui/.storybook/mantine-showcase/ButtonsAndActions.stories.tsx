/**
 * Importing npm packages
 */
import { ActionIcon, Button, Chip, Group, Stack } from '@mantine/core';
import { Search, Settings } from 'lucide-react';

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
  title: 'Mantine Showcase/Buttons & Actions',
  parameters: { layout: 'padded' },
});

export const Variants = meta.story({
  render: () => (
    <Group>
      {(['filled', 'light', 'outline', 'subtle', 'transparent', 'white'] as const).map((v) => (
        <Button key={v} variant={v}>
          {v}
        </Button>
      ))}
    </Group>
  ),
});

export const Sizes = meta.story({
  render: () => (
    <Group>
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
        <Button key={s} size={s}>
          Size {s}
        </Button>
      ))}
    </Group>
  ),
});

export const States = meta.story({
  render: () => (
    <Stack gap='md'>
      <Group>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button leftSection={<Search size={16} />}>With icon</Button>
        <Button radius='xl'>Pill shape</Button>
      </Group>
      <Button fullWidth>Full width</Button>
    </Stack>
  ),
});

export const ActionIcons = meta.story({
  render: () => (
    <Group>
      {(['filled', 'light', 'outline', 'subtle', 'transparent'] as const).map((v) => (
        <ActionIcon key={v} variant={v} aria-label={v}>
          <Settings size={16} />
        </ActionIcon>
      ))}
    </Group>
  ),
});

export const Chips = meta.story({
  render: () => (
    <Group>
      <Chip defaultChecked>Chip checked</Chip>
      <Chip>Chip unchecked</Chip>
    </Group>
  ),
});
