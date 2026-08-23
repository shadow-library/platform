import { describe, expect, it } from 'vitest';

import { createFixtureProvider, getFinanceProvider, getQuickLogProvider } from '@/lib/data';

const TODAY = '2026-08-22';

describe('quick capture routing', () => {
  it('should record a captured expense in Money, not only in the day feed', async () => {
    const provider = createFixtureProvider({ today: TODAY });

    const result = await provider.dispatchCommand({ type: 'expense.record', amountMinor: 350, currency: 'EUR', note: 'captured coffee' });
    expect(result.status).toBe('applied');

    const recorded = (await getFinanceProvider().expenses({ range: 'year' })).items.find(expense => expense.note === 'captured coffee');
    expect(recorded?.amountMinor).toBe(350);
    expect(recorded?.currency).toBe('EUR');
  });

  it('should fall back to the base currency when capture reports one Money does not support', async () => {
    const provider = createFixtureProvider({ today: TODAY });

    await provider.dispatchCommand({ type: 'expense.record', amountMinor: 900, currency: 'XYZ', note: 'captured oddity' });

    const recorded = (await getFinanceProvider().expenses({ range: 'year' })).items.find(expense => expense.note === 'captured oddity');
    expect(recorded?.currency).toBe('EUR');
  });

  it('should convert a captured weight in pounds to the canonical kilograms', async () => {
    const provider = createFixtureProvider({ today: TODAY });

    await provider.dispatchCommand({ type: 'weight.record', value: 172.5, unit: 'lb' });

    const { entries } = await getQuickLogProvider().weight();
    expect(entries.some(entry => Math.abs(entry.kg - 78.24) < 0.05)).toBe(true);
  });

  it('should record a captured side quest against the stat the parser chose', async () => {
    const provider = createFixtureProvider({ today: TODAY });

    await provider.dispatchCommand({ type: 'sideQuest.record', text: 'captured errand', statAffinity: 'wealth' });

    const { items } = await getQuickLogProvider().sideQuests();
    expect(items.find(item => item.name === 'captured errand')?.statAffinity).toBe('wealth');
  });

  it('should record a captured metric against the day it was captured for', async () => {
    const provider = createFixtureProvider({ today: TODAY });

    await provider.dispatchCommand({ type: 'metric.record', metric: 'steps', value: 9120 });

    const { metrics } = await getQuickLogProvider().health(TODAY);
    expect(metrics.find(metric => metric.definition.key === 'steps')?.entry?.value).toBe(9120);
  });
});
