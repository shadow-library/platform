/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Select } from './Select';

/**
 * Declaring the constants
 */
// Radix Select relies on pointer-capture, scrollIntoView, and ResizeObserver, none of which
// happy-dom implements — shim them so the listbox can open in tests.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function Regions(props: React.ComponentProps<typeof Select>) {
  return (
    <Select aria-label="Region" placeholder="Select region…" {...props}>
      <Select.Group label="US">
        <Select.Item value="us-east-1">us-east-1</Select.Item>
        <Select.Item value="us-west-2">us-west-2</Select.Item>
      </Select.Group>
      <Select.Separator />
      <Select.Item value="eu-central-1" disabled>
        eu-central-1
      </Select.Item>
    </Select>
  );
}

describe('Select', () => {
  it('renders a combobox trigger showing the placeholder', () => {
    render(<Regions />);
    const trigger = screen.getByRole('combobox', { name: 'Region' });
    expect(trigger).toHaveTextContent('Select region…');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('reflects size and invalid on the trigger', () => {
    render(<Regions size="lg" invalid />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('data-size', 'lg');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
  });

  it('opens the listbox and lists the options', async () => {
    const user = userEvent.setup();
    render(<Regions />);
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'us-east-1' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'US' })).toBeInTheDocument();
  });

  it('commits a selection and fires onValueChange', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Regions onValueChange={onValueChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'us-west-2' }));
    expect(onValueChange).toHaveBeenCalledWith('us-west-2');
    expect(screen.getByRole('combobox')).toHaveTextContent('us-west-2');
  });

  it('marks disabled options as unavailable', async () => {
    const user = userEvent.setup();
    render(<Regions />);
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'eu-central-1' })).toHaveAttribute('data-disabled');
  });

  it('supports a controlled value', async () => {
    function Controlled() {
      const [value, setValue] = useState('us-east-1');
      return <Regions value={value} onValueChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Controlled />);
    expect(screen.getByRole('combobox')).toHaveTextContent('us-east-1');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'us-west-2' }));
    expect(screen.getByRole('combobox')).toHaveTextContent('us-west-2');
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<Regions disabled />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
