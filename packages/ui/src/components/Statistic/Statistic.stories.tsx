/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Statistic } from './Statistic';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Statistic',
  component: Statistic,
  parameters: { layout: 'padded' },
  args: { label: 'p95 latency', value: 412, unit: 'ms' },
} satisfies Meta<typeof Statistic>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Static: Story = {};

export const WithDelta: Story = {
  args: { label: 'Error rate', value: 0.42, unit: '%', delta: -0.08, positiveIs: 'down', comparison: 'vs last week' },
};

export const RisingIsBad: Story = {
  args: { label: 'Error rate', value: 0.42, unit: '%', delta: 0.12, positiveIs: 'down', comparison: 'vs last week' },
};

export const Compact: Story = {
  args: { label: 'Requests', value: 2412806, unit: undefined, delta: 0.18, positiveIs: 'up', comparison: 'vs last week', format: { notation: 'compact' } },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 48, alignItems: 'flex-end' }}>
      <Statistic label="Small" value={1240} size="sm" delta={0.04} positiveIs="up" comparison="vs last week" />
      <Statistic label="Medium" value={1240} size="md" delta={0.04} positiveIs="up" comparison="vs last week" />
      <Statistic label="Large" value={1240} size="lg" delta={0.04} positiveIs="up" comparison="vs last week" />
    </div>
  ),
};

export const Linked: Story = {
  args: { label: 'Requests', value: 2412806, format: { notation: 'compact' }, delta: 0.18, positiveIs: 'up', comparison: 'vs last week', href: '#/metrics/requests' },
};

export const Loading: Story = {
  args: { label: 'p95 latency', value: 412, unit: 'ms', loading: true },
};

export const Unavailable: Story = {
  args: { label: 'p95 latency', value: 412, unit: 'ms', error: true },
};
