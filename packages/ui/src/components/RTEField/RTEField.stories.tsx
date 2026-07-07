/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { RTEField, useRTEField } from './RTEField';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/RTEField',
  component: RTEField,
  parameters: { layout: 'padded' },
  args: { label: 'Release notes', children: null },
} satisfies Meta<typeof RTEField>;

export default meta;

type Story = StoryObj<typeof meta>;

// A plain contenteditable stands in for a real engine's content element.
function FakeEditor({ onInput }: { onInput?: (text: string) => void }) {
  const { labelId, descriptionId, errorId, disabled, invalid } = useRTEField();
  return (
    // biome-ignore lint/a11y/useSemanticElements: stand-in for an engine's contenteditable, which is role=textbox
    <div
      role='textbox'
      aria-multiline='true'
      aria-labelledby={labelId}
      aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
      aria-disabled={disabled || undefined}
      aria-invalid={invalid || undefined}
      contentEditable={!disabled}
      suppressContentEditableWarning
      tabIndex={0}
      style={{ outline: 'none', minHeight: 96 }}
      onInput={event => onInput?.(event.currentTarget.textContent ?? '')}
    >
      Context Menu, Split Pane, and RTE Wrapper close out v1.1.
    </div>
  );
}

function Toolbar() {
  const [marks, setMarks] = useState({ bold: false, italic: false });
  const toggle = (key: 'bold' | 'italic') => setMarks(m => ({ ...m, [key]: !m[key] }));
  return (
    <RTEField.Toolbar>
      <RTEField.ToolbarButton aria-label='Bold' pressed={marks.bold} onClick={() => toggle('bold')}>
        B
      </RTEField.ToolbarButton>
      <RTEField.ToolbarButton aria-label='Italic' pressed={marks.italic} onClick={() => toggle('italic')}>
        <em>I</em>
      </RTEField.ToolbarButton>
      <RTEField.ToolbarDivider />
      <RTEField.ToolbarButton aria-label='Code'>&lt;/&gt;</RTEField.ToolbarButton>
    </RTEField.Toolbar>
  );
}

export const Default: Story = {
  render: () => {
    const [len, setLen] = useState(54);
    return (
      <RTEField label='Release notes' required description='Shown to customers on the changelog page. Markdown supported.' length={len} maxLength={2000} fullscreenEnabled>
        <Toolbar />
        <RTEField.Content>
          <FakeEditor onInput={text => setLen(text.length)} />
        </RTEField.Content>
        <RTEField.Attachments value={[{ id: 'a', label: 'screenshot.png' }]} onRemove={() => {}} />
        <RTEField.Footer>
          <Button variant='ghost'>Cancel</Button>
          <Button>Publish</Button>
        </RTEField.Footer>
      </RTEField>
    );
  },
};

export const ErrorState: Story = {
  render: () => (
    <RTEField label='Release notes' required length={2214} maxLength={2000} error='Release notes must be 2,000 characters or fewer.'>
      <Toolbar />
      <RTEField.Content>
        <FakeEditor />
      </RTEField.Content>
    </RTEField>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <RTEField label='Published notes' readOnly>
      <RTEField.Content>
        <FakeEditor />
      </RTEField.Content>
    </RTEField>
  ),
};
