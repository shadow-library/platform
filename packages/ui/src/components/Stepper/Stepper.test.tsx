/**
 * Importing npm packages
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Stepper } from './Stepper';

/**
 * Declaring the constants
 */
function Wizard({ accountValid = true, onFinish = () => {} }: { accountValid?: boolean; onFinish?: () => void }) {
  return (
    <Stepper>
      <Stepper.Step id="account" label="Account" validate={() => accountValid}>
        <h2>Account form</h2>
      </Stepper.Step>
      <Stepper.Step id="team" label="Invite team" optional>
        <h2>Team form</h2>
      </Stepper.Step>
      <Stepper.Step id="review" label="Review" onFinish={onFinish}>
        <h2>Review</h2>
      </Stepper.Step>
    </Stepper>
  );
}

describe('Stepper', () => {
  it('exposes an ordered progress nav with the current step marked', () => {
    render(<Wizard />);
    expect(screen.getByRole('navigation', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Account, step 1 of 3, current/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('heading', { name: 'Account form' })).toBeInTheDocument();
  });

  it('advances when the step validator passes', async () => {
    const user = userEvent.setup();
    render(<Wizard accountValid />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Team form' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Account, step 1 of 3, completed/ })).toBeInTheDocument();
  });

  it('blocks forward movement when validation fails', async () => {
    const user = userEvent.setup();
    render(<Wizard accountValid={false} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Account form' })).toBeInTheDocument();
  });

  it('allows free backward movement without validating', async () => {
    const user = userEvent.setup();
    render(<Wizard />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Account form' })).toBeInTheDocument();
  });

  it('skips an optional step and reaches Finish', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<Wizard onFinish={onFinish} />);
    await user.click(screen.getByRole('button', { name: 'Continue' })); // account -> team
    await user.click(screen.getByRole('button', { name: 'Skip' })); // team -> review
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledOnce());
  });
});
