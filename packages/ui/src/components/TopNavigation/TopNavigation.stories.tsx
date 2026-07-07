/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Avatar } from '../Avatar';
import { TopNavigation } from './TopNavigation';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/TopNavigation',
  component: TopNavigation,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TopNavigation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TopNavigation brand='Shadow' utility={<Avatar name='Maya Kim' size='sm' />}>
      <TopNavigation.Item href='#overview' active>
        Overview
      </TopNavigation.Item>
      <TopNavigation.Item href='#services'>Services</TopNavigation.Item>
      <TopNavigation.Item href='#deploys'>Deploys</TopNavigation.Item>
      <TopNavigation.Item href='#settings'>Settings</TopNavigation.Item>
    </TopNavigation>
  ),
};

export const WithOverflow: Story = {
  render: () => (
    <TopNavigation brand='Shadow' maxVisible={3} utility={<Avatar name='Maya Kim' size='sm' />}>
      <TopNavigation.Item href='#overview' active>
        Overview
      </TopNavigation.Item>
      <TopNavigation.Item href='#services'>Services</TopNavigation.Item>
      <TopNavigation.Item href='#deploys'>Deploys</TopNavigation.Item>
      <TopNavigation.Item href='#metrics'>Metrics</TopNavigation.Item>
      <TopNavigation.Item href='#settings'>Settings</TopNavigation.Item>
    </TopNavigation>
  ),
};
