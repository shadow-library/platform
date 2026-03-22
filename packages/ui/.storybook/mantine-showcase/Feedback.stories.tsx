/**
 * Importing npm packages
 */
import { Alert, Badge, Group, Loader, Progress, RingProgress, Skeleton, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-react';

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
  title: 'Mantine Showcase/Feedback',
  parameters: { layout: 'padded' },
});

export const Alerts = meta.story({
  render: () => (
    <Stack gap='md'>
      {(['info', 'success', 'warning', 'error'] as const).map(c => (
        <Alert
          key={c}
          color={c === 'error' ? 'red' : c === 'success' ? 'green' : c === 'warning' ? 'yellow' : 'blue'}
          title={c.charAt(0).toUpperCase() + c.slice(1)}
          icon={<AlertCircle size={16} />}
        >
          This is a {c} alert message.
        </Alert>
      ))}
    </Stack>
  ),
});

export const Loaders = meta.story({
  render: () => (
    <Group>
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(s => (
        <Loader key={s} size={s} />
      ))}
    </Group>
  ),
});

export const ProgressBars = meta.story({
  render: () => (
    <Stack gap='md'>
      <Progress value={65} />
      <Progress value={65} striped animated />
    </Stack>
  ),
});

export const RingProgressStories = meta.story({
  render: () => (
    <Group>
      <RingProgress
        size={80}
        thickness={8}
        sections={[{ value: 65, color: 'blue' }]}
        label={
          <Text size='xs' ta='center'>
            65%
          </Text>
        }
      />
      <RingProgress
        size={80}
        thickness={8}
        sections={[
          { value: 40, color: 'blue' },
          { value: 25, color: 'grape' },
        ]}
      />
    </Group>
  ),
});

export const Badges = meta.story({
  render: () => (
    <Group>
      {(['blue', 'green', 'red', 'yellow', 'gray'] as const).map(c => (
        <Badge key={c} color={c}>
          {c}
        </Badge>
      ))}
      {(['filled', 'light', 'outline', 'dot'] as const).map(v => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </Group>
  ),
});

export const Skeletons = meta.story({
  render: () => (
    <Stack gap='xs'>
      <Skeleton height={50} />
      <Skeleton height={20} mt={6} width='70%' />
    </Stack>
  ),
});
