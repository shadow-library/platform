/**
 * Importing npm packages
 */
import { act } from '@testing-library/react';
import { type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Calendar } from '@/components/Calendar';
import { Kbd } from '@/components/Kbd';
import { NotificationList } from '@/components/NotificationCenter';
import { Statistic } from '@/components/Statistic';

/**
 * Declaring the constants
 */
const HYDRATION_NOISE = /hydrat|did not match|server (rendered|HTML|-rendered)|text content does not match|tree hydrated/i;

/** Render on the "server", hydrate on the "client", and fail if React reports any hydration mismatch. */
async function expectHydrationClean(element: ReactElement): Promise<void> {
  const html = renderToString(element);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const recoverable: unknown[] = [];
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: error => recoverable.push(error) });
  });
  const consoleErrors = errorSpy.mock.calls.map(call => String(call[0]));
  errorSpy.mockRestore();
  root?.unmount();
  container.remove();

  expect(recoverable, 'React should report no recoverable hydration errors').toEqual([]);
  expect(
    consoleErrors.filter(message => HYDRATION_NOISE.test(message)),
    'no hydration-mismatch console errors',
  ).toEqual([]);
}

describe('SSR hydration', () => {
  it('hydrates Kbd without a platform-driven mismatch', async () => {
    await expectHydrationClean(<Kbd keys="mod+k" />);
  });

  it('hydrates Kbd with an explicit mac pin', async () => {
    await expectHydrationClean(<Kbd keys="mod+k" mac />);
  });

  it('hydrates Statistic without a locale-driven mismatch', async () => {
    await expectHydrationClean(<Statistic label="Revenue" value={1234567} delta={0.12} positiveIs="up" comparison="vs last week" format={{ notation: 'compact' }} />);
  });

  it('hydrates an unselected Calendar without a today-driven mismatch', async () => {
    await expectHydrationClean(<Calendar aria-label="Calendar" />);
  });

  it('hydrates a NotificationList feed without a relative-date mismatch', async () => {
    const items = [
      { id: '1', actor: 'Ada', action: 'commented', date: new Date(2024, 0, 15) },
      { id: '2', actor: 'Alan', action: 'approved', date: new Date(2024, 0, 14) },
    ];
    await expectHydrationClean(<NotificationList items={items} />);
  });
});
