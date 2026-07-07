/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Tabs } from './Tabs';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

const panelStyle = { fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' } as const;

export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <Tabs defaultValue='overview'>
        <Tabs.List aria-label='Service views'>
          <Tabs.Tab value='overview'>Overview</Tabs.Tab>
          <Tabs.Tab value='logs' count={12}>
            Logs
          </Tabs.Tab>
          <Tabs.Tab value='metrics'>Metrics</Tabs.Tab>
          <Tabs.Tab value='settings' disabled>
            Settings
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value='overview' style={panelStyle}>
          Service health, recent deploys, and key metrics for checkout-service.
        </Tabs.Panel>
        <Tabs.Panel value='logs' style={panelStyle}>
          Streaming logs — 12 new entries since your last visit.
        </Tabs.Panel>
        <Tabs.Panel value='metrics' style={panelStyle}>
          Latency, throughput, and error-rate charts.
        </Tabs.Panel>
      </Tabs>
    </div>
  ),
};

export const Manual: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <Tabs defaultValue='a' activation='manual'>
        <Tabs.List aria-label='Manual activation'>
          <Tabs.Tab value='a'>First</Tabs.Tab>
          <Tabs.Tab value='b'>Second</Tabs.Tab>
          <Tabs.Tab value='c'>Third</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value='a' style={panelStyle}>
          Arrow keys move focus; Enter or Space selects.
        </Tabs.Panel>
        <Tabs.Panel value='b' style={panelStyle}>
          Second panel.
        </Tabs.Panel>
        <Tabs.Panel value='c' style={panelStyle}>
          Third panel.
        </Tabs.Panel>
      </Tabs>
    </div>
  ),
};
