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
import { RadioGroup } from './RadioGroup';

/**
 * Declaring the constants
 */
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

function Plans(props: React.ComponentProps<typeof RadioGroup>) {
  return (
    <RadioGroup aria-label='Plan' {...props}>
      <RadioGroup.Item value='starter' label='Starter' description='Up to 5 seats' />
      <RadioGroup.Item value='pro' label='Pro' description='Unlimited seats' />
      <RadioGroup.Item value='enterprise' label='Enterprise' disabled />
    </RadioGroup>
  );
}

describe('RadioGroup', () => {
  it('renders a radiogroup with radio items named by their labels', () => {
    render(<Plans />);
    expect(screen.getByRole('radiogroup', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Enterprise' })).toBeInTheDocument();
  });

  it('selects an option from a click on its label', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Plans onValueChange={onValueChange} />);
    await user.click(screen.getByText('Pro'));
    expect(onValueChange).toHaveBeenCalledWith('pro');
  });

  it('is one tab stop with roving arrow-key focus', async () => {
    const user = userEvent.setup();
    render(<Plans defaultValue='starter' />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Starter' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Pro' })).toHaveFocus();
  });

  it('supports a controlled value', async () => {
    function Controlled() {
      const [value, setValue] = useState('starter');
      return <Plans value={value} onValueChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Controlled />);
    expect(screen.getByRole('radio', { name: 'Starter' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByText('Pro'));
    expect(screen.getByRole('radio', { name: 'Pro' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not select a disabled item', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Plans onValueChange={onValueChange} />);
    await user.click(screen.getByText('Enterprise'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('propagates the invalid state to each circle', () => {
    render(<Plans invalid />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('radio', { name: 'Starter' })).toHaveAttribute('data-invalid', 'true');
  });

  it('links descriptions via aria-describedby', () => {
    render(<Plans />);
    const radio = screen.getByRole('radio', { name: 'Starter' });
    const description = screen.getByText('Up to 5 seats');
    expect(radio.getAttribute('aria-describedby')).toBe(description.id);
  });
});
