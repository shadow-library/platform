/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Button } from './Button';

/**
 * Declaring the constants
 */
function PlusIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M8 3v10M3 8h10' />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M6 3l5 5-5 5' />
    </svg>
  );
}

const variants = ['primary', 'secondary', 'ghost', 'text', 'danger'] as const;

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  args: { children: 'Button', variant: 'secondary', size: 'md' },
  argTypes: {
    variant: { control: 'select', options: variants },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
    children: { control: 'text' },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — adjust props from the controls panel. */
export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {variants.map(variant => (
        <Button key={variant} variant={variant}>
          {variant[0]?.toUpperCase()}
          {variant.slice(1)}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
      <Button variant='primary' size='sm'>
        Small
      </Button>
      <Button variant='primary' size='md'>
        Medium
      </Button>
      <Button variant='primary' size='lg'>
        Large
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant='primary' prefix={<PlusIcon />}>
        New project
      </Button>
      <Button variant='secondary' suffix={<ArrowIcon />}>
        Continue
      </Button>
    </div>
  ),
};

/** Spinner-only — the label is hidden while the button's width is preserved. */
export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: 'Save changes' },
};

/** With `loadingText` — the label is swapped for the spinner and a status label. */
export const LoadingWithLabel: Story = {
  args: { variant: 'primary', loading: true, loadingText: 'Saving…', children: 'Save changes' },
};

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: 'Unavailable' },
};

export const FullWidth: Story = {
  args: { variant: 'primary', fullWidth: true, children: 'Full width' },
  decorators: [
    Story => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};

/** `asChild` renders the child element (here an anchor) with the button's styling. */
export const AsChild: Story = {
  render: () => (
    <Button asChild variant='primary'>
      <a href='https://example.com'>Anchor button</a>
    </Button>
  ),
};
