/**
 * Importing npm packages
 */
import { Group } from '@mantine/core';

/**
 * Importing user defined packages
 */
import { preview } from '$storybook/preview';

import * as Alphabets from '../Alphabets';
import { Logo } from '../Logo';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const { P, U, L, S, E } = Alphabets;
const productName = [P, U, L, S, E];
const alphabets = Object.values(Alphabets).filter((value): value is Alphabets.Alphabet => typeof value === 'function' && 'char' in value);

const meta = preview.meta({
  title: 'Shadow-UI/Logo',
  component: Logo,
  parameters: { layout: 'padded' },
});

export const Default = meta.story({
  decorators: [
    Story => (
      <div style={{ height: 48, width: 300 }}>
        <Story />
      </div>
    ),
  ],
});

export const InlineProduct = meta.story({
  args: {
    productName,
    variant: 'inline',
  },
  decorators: [
    Story => (
      <div style={{ height: 48, width: 300 }}>
        <Story />
      </div>
    ),
  ],
});

export const IconOnly = meta.story({
  args: {
    variant: 'icon',
  },
  decorators: [
    Story => (
      <div style={{ height: 48, width: 300 }}>
        <Story />
      </div>
    ),
  ],
});

export const IconWithProduct = meta.story({
  args: {
    productName,
    variant: 'icon',
  },
  decorators: [
    Story => (
      <div style={{ height: 48, width: 300 }}>
        <Story />
      </div>
    ),
  ],
});

export const SmallContainer = meta.story({
  args: {
    productName,
    variant: 'inline',
  },
  decorators: [
    Story => (
      <div style={{ height: 24, width: 200 }}>
        <Story />
      </div>
    ),
  ],
});

export const LargeContainer = meta.story({
  args: {
    productName,
    variant: 'inline',
  },
  decorators: [
    Story => (
      <div style={{ height: 72, width: 800 }}>
        <Story />
      </div>
    ),
  ],
});

export const AllAlphabets = meta.story({
  render: () => (
    <Group gap='md'>
      {alphabets.map(Letter => (
        <Letter key={Letter.char} fill='currentColor' height={48} />
      ))}
    </Group>
  ),
});
