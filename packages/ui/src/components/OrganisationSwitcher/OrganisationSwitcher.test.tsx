import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OrganisationSwitcher } from './OrganisationSwitcher';

const ORGANISATIONS = [
  { id: 'platform', name: 'Platform' },
  { id: 'acme', name: 'Acme' },
];

describe('OrganisationSwitcher', () => {
  it('should show the active organisation in a labelled picker', () => {
    render(<OrganisationSwitcher organisations={ORGANISATIONS} activeId="platform" onSwitch={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Active organisation' })).toHaveTextContent('Platform');
  });

  it('should render nothing when there is no choice to make', () => {
    const { container } = render(<OrganisationSwitcher organisations={ORGANISATIONS.slice(0, 1)} activeId="platform" onSwitch={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should render nothing while the active organisation is unknown', () => {
    const { container } = render(<OrganisationSwitcher organisations={ORGANISATIONS} activeId="elsewhere" onSwitch={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should hand the chosen organisation to onSwitch', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<OrganisationSwitcher organisations={ORGANISATIONS} activeId="platform" onSwitch={onSwitch} />);
    await user.click(screen.getByRole('combobox', { name: 'Active organisation' }));
    await user.click(await screen.findByRole('option', { name: 'Acme' }));
    expect(onSwitch).toHaveBeenCalledWith('acme');
  });

  it('should lock the picker while a switch is in flight', () => {
    render(<OrganisationSwitcher organisations={ORGANISATIONS} activeId="platform" onSwitch={vi.fn()} switching />);
    expect(screen.getByRole('combobox', { name: 'Active organisation' })).toBeDisabled();
  });
});
