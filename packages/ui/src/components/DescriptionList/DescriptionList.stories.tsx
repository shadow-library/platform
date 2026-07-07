/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Badge } from '../Badge';
import { Button } from '../Button';
import { DescriptionList } from './DescriptionList';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/DescriptionList',
  component: DescriptionList,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof DescriptionList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Row: Story = {
  render: () => (
    <DescriptionList
      title='Deployment details'
      action={
        <Button variant='ghost' size='sm'>
          Edit
        </Button>
      }
    >
      <DescriptionList.Item term='Service'>checkout-service</DescriptionList.Item>
      <DescriptionList.Item term='Deploy ID' mono copyable>
        d-8f2c41a9
      </DescriptionList.Item>
      <DescriptionList.Item term='Status'>
        <Badge intent='success' dot>
          Healthy
        </Badge>
      </DescriptionList.Item>
      <DescriptionList.Item term='Region'>us-east-1</DescriptionList.Item>
      <DescriptionList.Item term='API key' masked copyable>
        sk-live-8f2c41a9d0
      </DescriptionList.Item>
      <DescriptionList.Item term='Rolled back' />
    </DescriptionList>
  ),
};

export const Column: Story = {
  render: () => (
    <DescriptionList layout='column' title='Invoice'>
      <DescriptionList.Item term='Number' mono>
        INV-2048
      </DescriptionList.Item>
      <DescriptionList.Item term='Amount'>$1,240.00</DescriptionList.Item>
      <DescriptionList.Item term='Due'>Jul 21, 2026</DescriptionList.Item>
    </DescriptionList>
  ),
};

export const Grid: Story = {
  render: () => (
    <DescriptionList layout='grid' columns={3} title='Cluster overview'>
      <DescriptionList.Item term='Nodes'>12</DescriptionList.Item>
      <DescriptionList.Item term='CPU'>68%</DescriptionList.Item>
      <DescriptionList.Item term='Memory'>41%</DescriptionList.Item>
      <DescriptionList.Item term='Version' mono>
        v1.29.4
      </DescriptionList.Item>
      <DescriptionList.Item term='Uptime'>19d 4h</DescriptionList.Item>
      <DescriptionList.Item term='Incidents' />
    </DescriptionList>
  ),
};
