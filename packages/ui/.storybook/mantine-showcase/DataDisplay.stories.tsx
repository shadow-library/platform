/**
 * Importing npm packages
 */
import { Accordion, Avatar, Badge, Button, Card, ColorSwatch, Group, Indicator, List, Pill, Table, Text, ThemeIcon, Timeline } from '@mantine/core';
import { Check } from 'lucide-react';

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
  title: 'Mantine Showcase/Data Display',
  parameters: { layout: 'padded' },
});

export const ThemeIcons = meta.story({
  render: () => (
    <Group>
      {['blue', 'green', 'red', 'yellow', 'violet'].map(c => (
        <ThemeIcon key={c} color={c} variant='light'>
          <Check size={16} />
        </ThemeIcon>
      ))}
    </Group>
  ),
});

export const Avatars = meta.story({
  render: () => (
    <Group>
      <Avatar src={null} alt='no image' color='blue'>
        LB
      </Avatar>
      <Avatar src={null} alt='no image' color='green' radius='sm'>
        AB
      </Avatar>
      <Indicator label='3' size={18}>
        <Avatar src={null} color='violet'>
          JS
        </Avatar>
      </Indicator>
      <Avatar.Group>
        {['blue', 'red', 'green'].map(c => (
          <Avatar key={c} src={null} color={c}>
            {c[0]?.toUpperCase()}
          </Avatar>
        ))}
      </Avatar.Group>
    </Group>
  ),
});

export const Cards = meta.story({
  render: () => (
    <Card shadow='sm' padding='lg' radius='md' withBorder maw={360}>
      <Text fw={500}>Card title</Text>
      <Text size='sm' c='dimmed' mt='xs'>
        This is a Mantine Card component rendered with your custom theme.
      </Text>
      <Button mt='md' radius='md' fullWidth>
        Card action
      </Button>
    </Card>
  ),
});

export const Accordions = meta.story({
  render: () => (
    <Accordion>
      <Accordion.Item value='one'>
        <Accordion.Control>Item one</Accordion.Control>
        <Accordion.Panel>Content for item one.</Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value='two'>
        <Accordion.Control>Item two</Accordion.Control>
        <Accordion.Panel>Content for item two.</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  ),
});

export const Tables = meta.story({
  render: () => (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Role</Table.Th>
          <Table.Th>Status</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {[
          { name: 'Alice', role: 'Admin', status: 'Active' },
          { name: 'Bob', role: 'Editor', status: 'Inactive' },
        ].map(row => (
          <Table.Tr key={row.name}>
            <Table.Td>{row.name}</Table.Td>
            <Table.Td>{row.role}</Table.Td>
            <Table.Td>
              <Badge color={row.status === 'Active' ? 'green' : 'gray'} size='sm'>
                {row.status}
              </Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  ),
});

export const Timelines = meta.story({
  render: () => (
    <Timeline active={1} bulletSize={24}>
      <Timeline.Item title='Commit pushed'>
        <Text size='xs' c='dimmed'>
          Feature branch merged
        </Text>
      </Timeline.Item>
      <Timeline.Item title='CI passed' bullet={<Check size={12} />}>
        <Text size='xs' c='dimmed'>
          All checks green
        </Text>
      </Timeline.Item>
      <Timeline.Item title='Deployed' color='gray'>
        <Text size='xs' c='dimmed'>
          Waiting for approval
        </Text>
      </Timeline.Item>
    </Timeline>
  ),
});

export const Lists = meta.story({
  render: () => (
    <List spacing='xs' size='sm'>
      <List.Item>TypeScript strict mode</List.Item>
      <List.Item>Biome for lint + format</List.Item>
      <List.Item>Vitest for testing</List.Item>
    </List>
  ),
});

export const ColorSwatches = meta.story({
  render: () => (
    <Group>
      {['blue', 'red', 'green', 'grape', 'orange'].map(c => (
        <ColorSwatch key={c} color={`var(--mantine-color-${c}-6)`} />
      ))}
    </Group>
  ),
});

export const Pills = meta.story({
  render: () => (
    <Group>
      <Pill>Default pill</Pill>
      <Pill withRemoveButton>Removable</Pill>
    </Group>
  ),
});
