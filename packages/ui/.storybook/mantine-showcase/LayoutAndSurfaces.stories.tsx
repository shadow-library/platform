/**
 * Importing npm packages
 */
import { Center, Divider, Flex, Grid, Paper, ScrollArea, Stack, Text } from '@mantine/core';

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
  title: 'Mantine Showcase/Layout & Surfaces',
  parameters: { layout: 'padded' },
});

export const Papers = meta.story({
  render: () => (
    <Stack gap='md'>
      <Paper shadow='xs' p='md'>
        Paper with xs shadow
      </Paper>
      <Paper shadow='md' p='md' withBorder>
        Paper with border
      </Paper>
    </Stack>
  ),
});

export const Dividers = meta.story({
  render: () => <Divider label='Divider with label' labelPosition='center' />,
});

export const GridLayout = meta.story({
  render: () => (
    <Grid>
      {[1, 2, 3, 4].map(n => (
        <Grid.Col key={n} span={3}>
          <Paper p='sm' withBorder>
            <Center>
              <Text size='sm'>Col {n}</Text>
            </Center>
          </Paper>
        </Grid.Col>
      ))}
    </Grid>
  ),
});

export const FlexLayout = meta.story({
  render: () => (
    <Flex gap='sm' wrap='wrap'>
      {['start', 'center', 'end'].map(a => (
        <Paper key={a} p='sm' withBorder miw={80}>
          <Text size='xs' ta='center'>
            {a}
          </Text>
        </Paper>
      ))}
    </Flex>
  ),
});

export const ScrollAreas = meta.story({
  render: () => (
    <ScrollArea h={100}>
      {Array.from({ length: 10 }, (_, i) => (
        <Text key={i} size='sm'>
          Scrollable item {i + 1}
        </Text>
      ))}
    </ScrollArea>
  ),
});
