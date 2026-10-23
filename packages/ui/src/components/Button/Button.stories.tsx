import { type Meta, type StoryObj } from '@storybook/react-vite';

import { Button } from './Button';

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3l5 5-5 5" />
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
      <Button variant="primary" size="sm">
        Small
      </Button>
      <Button variant="primary" size="md">
        Medium
      </Button>
      <Button variant="primary" size="lg">
        Large
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant="primary" prefix={<PlusIcon />}>
        New project
      </Button>
      <Button variant="secondary" suffix={<ArrowIcon />}>
        Continue
      </Button>
    </div>
  ),
};

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: 'Save changes' },
};

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

export const AsChild: Story = {
  render: () => (
    <Button asChild variant="primary">
      <a href="https://example.com">Anchor button</a>
    </Button>
  ),
};
