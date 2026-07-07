/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { RTEField, useRTEField } from './RTEField';

/**
 * Declaring the constants
 */
function Editable() {
  const { labelId, disabled, invalid } = useRTEField();
  // biome-ignore lint/a11y/useSemanticElements: stand-in for an engine's contenteditable, which is role=textbox
  return <div role='textbox' aria-multiline='true' aria-labelledby={labelId} aria-disabled={disabled || undefined} aria-invalid={invalid || undefined} tabIndex={0} />;
}

function Field(props: Partial<Parameters<typeof RTEField>[0]>) {
  return (
    <RTEField label='Release notes' required length={props.length ?? 412} maxLength={2000} {...props}>
      <RTEField.Toolbar>
        <RTEField.ToolbarButton aria-label='Bold' pressed={false}>
          B
        </RTEField.ToolbarButton>
        <RTEField.ToolbarButton aria-label='Italic' pressed>
          I
        </RTEField.ToolbarButton>
      </RTEField.Toolbar>
      <RTEField.Content>
        <Editable />
      </RTEField.Content>
    </RTEField>
  );
}

describe('RTEField', () => {
  it('labels the editor and renders the counter', () => {
    render(<Field />);
    expect(screen.getByRole('textbox')).toHaveAccessibleName(/Release notes/);
    expect(screen.getByText('412 / 2000')).toBeInTheDocument();
  });

  it('exposes toolbar toggle state via aria-pressed', () => {
    render(<Field />);
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('roves toolbar focus with arrow keys (one tab stop)', async () => {
    const user = userEvent.setup();
    render(<Field />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    bold.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveFocus();
  });

  it('shows the error line and marks the frame invalid past the limit', () => {
    render(<Field length={2214} error='Release notes must be 2,000 characters or fewer.' />);
    expect(screen.getByRole('alert')).toHaveTextContent('2,000 characters or fewer');
    expect(screen.getByText('2214 / 2000')).toHaveAttribute('data-state', 'error');
  });
});
