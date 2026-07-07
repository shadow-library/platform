/**
 * Importing npm packages
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { HoverCard } from './HoverCard';

/**
 * Declaring the constants
 */

describe('HoverCard', () => {
  it('opens a labelled preview on hover and leaves the trigger a plain link', async () => {
    const user = userEvent.setup();
    render(
      <HoverCard openDelay={0} closeDelay={0} card={<p>Staff Engineer · Platform</p>} aria-label='Mira Kessler preview'>
        <a href='/people/mira'>@mira</a>
      </HoverCard>,
    );
    const trigger = screen.getByRole('link', { name: '@mira' });
    expect(trigger).toHaveAttribute('href', '/people/mira');
    await user.hover(trigger);
    const card = await screen.findByRole('dialog', { name: 'Mira Kessler preview' });
    expect(card).toHaveTextContent('Staff Engineer · Platform');
  });

  it('loads async content once at hover-intent, showing the fallback first', async () => {
    const user = userEvent.setup();
    let calls = 0;
    let resolve: (value: { name: string }) => void = () => {};
    render(
      <HoverCard
        openDelay={0}
        closeDelay={0}
        content={() => {
          calls += 1;
          return new Promise<{ name: string }>(res => {
            resolve = res;
          });
        }}
        render={data => <span>{data.name}</span>}
        fallback={<span>Loading preview…</span>}
      >
        <a href='/people/mira'>@mira</a>
      </HoverCard>,
    );
    await user.hover(screen.getByRole('link', { name: '@mira' }));
    expect(await screen.findByText('Loading preview…')).toBeInTheDocument();
    resolve({ name: 'Mira Kessler' });
    await waitFor(() => expect(screen.getByText('Mira Kessler')).toBeInTheDocument());
    expect(calls).toBe(1);
  });

  it('shows a quiet fallback when the loader rejects', async () => {
    const user = userEvent.setup();
    render(
      <HoverCard openDelay={0} closeDelay={0} content={() => Promise.reject(new Error('nope'))} render={() => <span>never</span>}>
        <a href='/repos/x'>repo</a>
      </HoverCard>,
    );
    await user.hover(screen.getByRole('link', { name: 'repo' }));
    expect(await screen.findByText("Couldn't load preview")).toBeInTheDocument();
  });
});
