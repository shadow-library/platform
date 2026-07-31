/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Banner } from './Banner';
import { BannerOutlet, useBanner } from './Banner.provider';
import { bannerStore } from './Banner.store';

/**
 * Declaring the constants
 */
afterEach(() => bannerStore.reset());

describe('Banner', () => {
  it('uses role=alert for danger and role=status otherwise', () => {
    const { rerender } = render(<Banner intent="danger" message="Payment failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Payment failed');
    rerender(<Banner intent="warning" message="Trial ends soon" />);
    expect(screen.getByRole('status')).toHaveTextContent('Trial ends soon');
  });

  it('renders the single action and dismiss button', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Banner intent="warning" message="Invoice overdue" action={{ label: 'Pay now', onClick: vi.fn() }} dismissable onDismiss={onDismiss} />);
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('Banner queue', () => {
  function App({ dangerOn }: { dangerOn: boolean }) {
    useBanner({ id: 'trial', intent: 'warning', message: 'Trial ends in 3 days' });
    useBanner({ id: 'outage', intent: 'danger', message: 'API is degraded', when: dangerOn });
    return <BannerOutlet />;
  }

  it('shows only the highest-severity banner and reveals the next when it clears', () => {
    const { rerender } = render(<App dangerOn />);
    expect(screen.getByRole('alert')).toHaveTextContent('API is degraded');
    expect(screen.queryByText('Trial ends in 3 days')).not.toBeInTheDocument();

    rerender(<App dangerOn={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Trial ends in 3 days');
  });

  it('keeps a dismissed banner hidden until its message changes', async () => {
    const user = userEvent.setup();
    function Dismissible({ message }: { message: string }) {
      useBanner({ id: 'invoice', intent: 'warning', message, dismissable: true });
      return <BannerOutlet />;
    }
    const { rerender } = render(<Dismissible message="Invoice 14 days overdue" />);
    await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByText('Invoice 14 days overdue')).not.toBeInTheDocument();

    rerender(<Dismissible message="Invoice 30 days overdue — service paused" />);
    expect(screen.getByText('Invoice 30 days overdue — service paused')).toBeInTheDocument();
  });
});
