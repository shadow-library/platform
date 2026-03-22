/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { preview } from '$storybook/preview';
import { E, L, P, S, U } from '../Alphabets';
import { Logo } from '../Logo';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const productName = [P, U, L, S, E];

const meta = preview.meta({
  title: 'Shadow-UI/Logo',
  component: Logo,
  parameters: { layout: 'padded' },
});

export const Default = meta.story({
  decorators: [
    (Story) => (
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
    (Story) => (
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
    (Story) => (
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
    (Story) => (
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
    (Story) => (
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
    (Story) => (
      <div style={{ height: 72, width: 800 }}>
        <Story />
      </div>
    ),
  ],
});
