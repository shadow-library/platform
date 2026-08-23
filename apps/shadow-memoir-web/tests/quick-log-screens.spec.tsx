import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EntryCapNote } from '@/components/EntryCapNote';
import { HealthMetricsScreen, MealsScreen, WeightScreen } from '@/features/quick-logs';
import { deriveCapAdvisory, MONTHLY_ENTRY_CAP } from '@/lib/data';

import { renderWithQuery } from './harness';

describe('weight screen', () => {
  it('should ask before replacing a value already logged for today', async () => {
    renderWithQuery(<WeightScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Replace today’s weight?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDefined();
  });

  it('should say the replaced value is kept rather than lost', async () => {
    renderWithQuery(<WeightScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/stays visible in History/)).toBeDefined();
  });

  it('should state that weight is context and never a target', async () => {
    renderWithQuery(<WeightScreen />);
    expect(await screen.findByText(/never sets a goal weight/)).toBeDefined();
  });
});

describe('meals screen', () => {
  it('should offer one-tap re-logging from the presets', async () => {
    renderWithQuery(<MealsScreen />);
    expect(await screen.findAllByRole('button', { name: /Breakfast oats/ })).toBeDefined();
  });

  it('should log a preset and keep the calories it was logged with', async () => {
    renderWithQuery(<MealsScreen />);
    const before = (await screen.findByRole('heading', { name: /kcal/ })).textContent ?? '';

    fireEvent.click((await screen.findAllByRole('button', { name: /^Breakfast oats$/ }))[0]!);

    await waitFor(async () => expect((await screen.findByRole('heading', { name: /kcal/ })).textContent).not.toBe(before));
    expect(screen.getAllByText('Oats, berries, skyr').length + screen.getAllByText('Breakfast oats').length).toBeGreaterThan(0);
  });

  it('should say a blank day is blank rather than zero', async () => {
    renderWithQuery(<MealsScreen />);
    expect(await screen.findByText(/blank, not zero/)).toBeDefined();
  });
});

describe('health metrics screen', () => {
  it('should offer the quest when a threshold is met and leave completing it to the owner', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    expect(await screen.findByText(/never completes a quest for you/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Complete the quest/ })).toBeDefined();
  });

  it('should show progress towards a threshold that is not met without offering anything', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    expect(await screen.findByText(/70% of 2.0 l/)).toBeDefined();
  });

  it('should give every metric a manual entry field', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    for (const name of ['Steps', 'Calories burned', 'Sleep', 'Water']) expect(await screen.findByLabelText(`${name} for today`)).toBeDefined();
  });

  it('should state that a blank metric day costs nothing', async () => {
    renderWithQuery(<HealthMetricsScreen />);
    expect(await screen.findByText(/they never cost HP/)).toBeDefined();
  });
});

describe('entry cap advisory', () => {
  it('should render nothing while the allowance is comfortable', () => {
    const { container } = renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('journal', 10)} />);
    expect(container.textContent).toBe('');
  });

  it('should advise at 80% of the allowance without any blocking language', () => {
    renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('meals', MONTHLY_ENTRY_CAP * 0.8)} />);
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('entries keep saving');
    expect(note.dataset.capLevel).toBe('approaching');
  });

  it('should keep saving past 100% and say so', () => {
    renderWithQuery(<EntryCapNote advisory={deriveCapAdvisory('expenses', MONTHLY_ENTRY_CAP)} />);
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('Everything still saves');
    expect(note.dataset.capLevel).toBe('reached');
  });
});
