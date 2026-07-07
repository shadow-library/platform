/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { DescriptionList } from './DescriptionList';

/**
 * Declaring the constants
 */

describe('DescriptionList', () => {
  it('renders term/detail pairs as a semantic dl', () => {
    render(
      <DescriptionList title='Deployment'>
        <DescriptionList.Item term='Service'>checkout-service</DescriptionList.Item>
      </DescriptionList>,
    );
    expect(screen.getByRole('term')).toHaveTextContent('Service');
    expect(screen.getByRole('definition')).toHaveTextContent('checkout-service');
  });

  it('renders an em dash for empty children', () => {
    render(
      <DescriptionList>
        <DescriptionList.Item term='Rolled back' />
      </DescriptionList>,
    );
    expect(screen.getByRole('definition')).toHaveTextContent('—');
  });

  it('copies the value text on the copy button', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <DescriptionList>
        <DescriptionList.Item term='Deploy ID' mono copyable>
          d-8f2c41a9
        </DescriptionList.Item>
      </DescriptionList>,
    );
    await user.click(screen.getByRole('button', { name: 'Copy Deploy ID' }));
    expect(writeText).toHaveBeenCalledWith('d-8f2c41a9');
  });

  it('reveals a masked value with the toggle', async () => {
    const user = userEvent.setup();
    render(
      <DescriptionList>
        <DescriptionList.Item term='API key' masked>
          sk-live-42
        </DescriptionList.Item>
      </DescriptionList>,
    );
    expect(screen.getByText('sk-live-42')).toHaveAttribute('data-hidden');
    await user.click(screen.getByRole('button', { name: 'Show API key' }));
    expect(screen.getByText('sk-live-42')).not.toHaveAttribute('data-hidden');
  });
});
