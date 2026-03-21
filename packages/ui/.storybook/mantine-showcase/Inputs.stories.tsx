/**
 * Importing npm packages
 */
import {
  Checkbox,
  FileInput,
  MultiSelect,
  NumberInput,
  PasswordInput,
  Radio,
  Rating,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';

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
  title: 'Mantine Showcase/Inputs',
  parameters: { layout: 'padded' },
});

export const TextInputs = meta.story({
  render: () => (
    <SimpleGrid cols={2} spacing='md'>
      <TextInput label='Text input' placeholder='Enter text' description='Helper text' />
      <PasswordInput label='Password' placeholder='Your password' />
      <NumberInput label='Number input' placeholder='0' />
      <Textarea label='Textarea' placeholder='Long form text' autosize minRows={2} />
    </SimpleGrid>
  ),
});

export const SelectInputs = meta.story({
  render: () => (
    <SimpleGrid cols={2} spacing='md'>
      <Select label='Select' placeholder='Pick one' data={['React', 'Vue', 'Angular', 'Svelte']} />
      <MultiSelect label='Multi select' placeholder='Pick many' data={['React', 'Vue', 'Angular', 'Svelte']} />
      <FileInput label='File input' placeholder='Upload file' />
      <SegmentedControl
        data={[
          { label: 'React', value: 'react' },
          { label: 'Vue', value: 'vue' },
          { label: 'Angular', value: 'ng' },
        ]}
      />
    </SimpleGrid>
  ),
});

export const CheckboxAndRadio = meta.story({
  render: () => (
    <SimpleGrid cols={2} spacing='md'>
      <Stack gap='xs'>
        <Checkbox label='Checkbox default' defaultChecked />
        <Checkbox label='Checkbox indeterminate' indeterminate />
        <Checkbox label='Checkbox disabled' disabled />
      </Stack>
      <Radio.Group label='Radio group' defaultValue='a'>
        <Stack gap='xs' mt='xs'>
          <Radio value='a' label='Option A' />
          <Radio value='b' label='Option B' />
        </Stack>
      </Radio.Group>
    </SimpleGrid>
  ),
});

export const ToggleAndSlider = meta.story({
  render: () => (
    <SimpleGrid cols={2} spacing='md'>
      <Stack gap='xs'>
        <Switch label='Switch on' defaultChecked />
        <Switch label='Switch off' />
      </Stack>
      <Stack gap='xs'>
        <Text size='sm' fw={500}>
          Slider
        </Text>
        <Slider defaultValue={40} />
      </Stack>
      <Stack gap='xs'>
        <Text size='sm' fw={500}>
          Rating
        </Text>
        <Rating defaultValue={3} />
      </Stack>
    </SimpleGrid>
  ),
});
