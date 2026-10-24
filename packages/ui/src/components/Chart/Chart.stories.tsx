import { type Meta, type StoryObj } from '@storybook/react-vite';

import { Card } from '../Card';
import { Chart } from './Chart';
import { type ChartDatum, type ChartSeries } from './Chart.types';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_COMPACT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const formatUsd = (value: number): string => USD.format(value);
const formatUsdTick = (value: number): string => USD_COMPACT.format(value);
const formatDay = (x: string): string => new Date(`${x}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const APPS: ChartSeries[] = [
  { key: 'novel-forge', label: 'Novel Forge' },
  { key: 'memoir', label: 'Memoir' },
  { key: 'web-novel', label: 'Web Novel' },
  { key: 'other', label: 'Other', tone: 'neutral' },
];

function dailyCost(days: number): ChartDatum[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
    const wave = 1 + Math.sin(i / 3) * 0.4;
    return {
      x: date,
      values: {
        'novel-forge': Number((4.2 * wave + (i % 5) * 0.3).toFixed(2)),
        memoir: Number((1.6 + (i % 7) * 0.25).toFixed(2)),
        'web-novel': Number((0.9 * wave).toFixed(2)),
        other: Number((0.35 + (i % 3) * 0.1).toFixed(2)),
      },
    };
  });
}

const meta = {
  title: 'Components/Chart',
  component: Chart,
  parameters: { layout: 'padded' },
  args: { type: 'bar', stacked: true, data: dailyCost(14), series: APPS, formatValue: formatUsd, formatTick: formatUsdTick, formatX: formatDay, 'aria-label': 'Daily cost by app' },
  decorators: [
    Story => (
      <Card style={{ maxWidth: 720 }}>
        <Card.Body>
          <Story />
        </Card.Body>
      </Card>
    ),
  ],
} satisfies Meta<typeof Chart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StackedBar: Story = {};

export const GroupedBar: Story = {
  args: { stacked: false, data: dailyCost(6), series: APPS.slice(0, 3) },
};

export const Line: Story = {
  args: { type: 'line', stacked: false, data: dailyCost(30), series: APPS.slice(0, 3) },
};

export const SingleSeriesLine: Story = {
  args: { type: 'line', stacked: false, data: dailyCost(30), series: APPS.slice(0, 1), 'aria-label': 'Novel Forge daily cost' },
};

export const StackedArea: Story = {
  args: { type: 'area', data: dailyCost(30) },
};

export const ManyXValues: Story = {
  args: { data: dailyCost(90), 'aria-label': 'Daily cost by app, last 90 days' },
};

export const Empty: Story = {
  args: { data: [] },
};

export const DarkTheme: Story = {
  args: { type: 'area', data: dailyCost(30) },
  globals: { theme: 'dark' },
};

export const Mobile: Story = {
  args: { data: dailyCost(30) },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
