import { act } from '@testing-library/react';
import { type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Calendar } from '@/components/Calendar';
import { Chart } from '@/components/Chart';
import { Kbd } from '@/components/Kbd';
import { NotificationList } from '@/components/NotificationCenter';
import { Statistic } from '@/components/Statistic';

const HYDRATION_NOISE = /hydrat|did not match|server (rendered|HTML|-rendered)|text content does not match|tree hydrated/i;

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

  it('should hydrate a stacked Chart without a measurement-driven mismatch', async () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ x: `Oct ${i + 1}`, values: { forge: (i * 37) % 11, memoir: (i * 13) % 7, other: 1.25 } }));
    const series = [
      { key: 'forge', label: 'Novel Forge' },
      { key: 'memoir', label: 'Memoir' },
      { key: 'other', label: 'Other', tone: 'neutral' as const },
    ];
    await expectHydrationClean(<Chart type="bar" stacked data={data} series={series} aria-label="Daily cost" />);
    await expectHydrationClean(<Chart type="area" stacked data={data} series={series} aria-label="Daily cost" />);
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
