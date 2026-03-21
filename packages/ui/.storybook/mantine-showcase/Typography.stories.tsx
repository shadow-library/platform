/**
 * Importing npm packages
 */
import { Anchor, Blockquote, Code, Highlight, Kbd, Mark, Space, Stack, Text, Title } from '@mantine/core';

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
  title: 'Mantine Showcase/Typography',
  parameters: { layout: 'padded' },
});

export const Headings = meta.story({
  render: () => (
    <Stack gap='md'>
      <Title order={1}>Heading 1</Title>
      <Title order={2}>Heading 2</Title>
      <Title order={3}>Heading 3</Title>
    </Stack>
  ),
});

export const Texts = meta.story({
  render: () => (
    <Stack gap='md'>
      <Text size='xl'>Text xl — The quick brown fox</Text>
      <Text size='md'>Text md — The quick brown fox</Text>
      <Text size='sm' c='dimmed'>
        Text sm dimmed — secondary info
      </Text>
      <Text size='xs' c='dimmed'>
        Text xs dimmed
      </Text>
    </Stack>
  ),
});

export const OtherTypographyElements = meta.story({
  render: () => (
    <Stack gap='md'>
      <Highlight highlight='brown'>Highlight: The quick brown fox jumps over the lazy dog</Highlight>
      <Text>
        Inline <Mark>mark</Mark> and <Code>code snippet</Code>
      </Text>
      <Anchor href='#' size='sm'>
        Anchor link
      </Anchor>
      <Blockquote cite='— Mantine docs' mt='md'>
        Every Mantine component supports visual customisations with props.
      </Blockquote>
      <Space>
        <Kbd>⌘</Kbd> + <Kbd>K</Kbd>
      </Space>
    </Stack>
  ),
});
