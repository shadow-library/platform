import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Chart } from './Chart';
import { columnTotal, domainMax, labelBox, niceTicks, planLabels, resolveSlots, stackColumn } from './Chart.scale';
import { type ChartDatum, type ChartSeries } from './Chart.types';

const SERIES: ChartSeries[] = [
  { key: 'forge', label: 'Novel Forge' },
  { key: 'memoir', label: 'Memoir' },
  { key: 'other', label: 'Other', tone: 'neutral' },
];

const DATA: ChartDatum[] = [
  { x: 'Mon', values: { forge: 4, memoir: 2, other: 1 } },
  { x: 'Tue', values: { forge: 6, memoir: 1.5 } },
  { x: 'Wed', values: { forge: 3, memoir: 4, other: 2 } },
];

describe('niceTicks', () => {
  it('should step in 1, 2 or 5 times a power of ten and cover the maximum', () => {
    expect(niceTicks(7, 4)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceTicks(940, 4)).toEqual({ top: 1000, ticks: [0, 200, 400, 600, 800, 1000] });
    expect(niceTicks(11.33, 4)).toEqual({ top: 12, ticks: [0, 2, 4, 6, 8, 10, 12] });
  });

  it('should keep fractional steps free of float noise', () => {
    expect(niceTicks(0.7, 4).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(niceTicks(0.03, 3).ticks).toEqual([0, 0.01, 0.02, 0.03]);
  });

  it('should fall back to a unit domain when every value is zero or invalid', () => {
    expect(niceTicks(0, 4).top).toBe(1);
    expect(niceTicks(Number.NaN, 4).top).toBe(1);
    expect(niceTicks(-5, 4).ticks[0]).toBe(0);
  });
});

describe('stacking', () => {
  it('should total every series and treat a missing value as zero', () => {
    expect(columnTotal(DATA[1]!, SERIES)).toBe(7.5);
  });

  it('should stack segments end to end and clamp negatives at the baseline', () => {
    const datum: ChartDatum = { x: 'Thu', values: { forge: 3, memoir: -2, other: 1 } };
    expect(stackColumn(datum, SERIES)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 3 },
      { start: 3, end: 4 },
    ]);
    expect(columnTotal(datum, SERIES)).toBe(2);
  });

  it('should take the domain from stacked totals only when stacked', () => {
    expect(domainMax(DATA, SERIES, true)).toBe(9);
    expect(domainMax(DATA, SERIES, false)).toBe(6);
  });
});

describe('planLabels', () => {
  it('should label every point when they fit', () => {
    expect(planLabels(['Mon', 'Tue', 'Wed'])).toEqual({ step: 1, indices: [0, 1, 2] });
  });

  it('should thin many labels to a fixed step that always keeps the last point', () => {
    const labels = Array.from({ length: 90 }, (_, i) => `Oct ${i}`);
    const { step, indices } = planLabels(labels);
    expect(indices.length).toBeLessThanOrEqual(12);
    expect(indices.at(-1)).toBe(89);
    for (let i = 1; i < indices.length; i++) expect(indices[i]! - indices[i - 1]!).toBe(step);
  });

  it('should give label boxes that tile without overlap and stay inside the plot', () => {
    const count = 30;
    const { step, indices } = planLabels(Array.from({ length: count }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`));
    const boxes = indices.map(index => labelBox(index, step, count));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(100 + 1e-9);
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.left + boxes[i - 1]!.width - 1e-9);
    expect(boxes.at(-1)!.align).toBe('end');
  });
});

describe('resolveSlots', () => {
  const plain = (...keys: string[]): ChartSeries[] => keys.map(key => ({ key, label: key }));

  it('should number unpinned series by position and leave neutral out of the count', () => {
    expect(resolveSlots([...plain('a'), { key: 'o', label: 'Other', tone: 'neutral' }, ...plain('b')])).toEqual(['1', 'neutral', '2']);
  });

  it('should honour a pinned slot and give the rest the lowest unpinned slots in order', () => {
    const series = [{ key: 'a', label: 'a', slot: 1 }, ...plain('b', 'c'), { key: 'd', label: 'd', slot: 3 }];
    expect(resolveSlots(series)).toEqual(['1', '2', '4', '3']);
  });

  it('should keep a pinned colour when the surrounding series change', () => {
    const pinned = { key: 'x', label: 'x', slot: 5 };
    expect(resolveSlots([...plain('a', 'b'), pinned])[2]).toBe('5');
    expect(resolveSlots([pinned])[0]).toBe('5');
  });

  it('should wrap out-of-range and fractional slots modulo the palette', () => {
    const slots = [9, 16, 0, -1, 2.4].map(slot => ({ key: String(slot), label: 'x', slot }));
    expect(resolveSlots(slots)).toEqual(['1', '8', '8', '7', '2']);
  });

  it('should ignore a non-finite slot', () => {
    expect(resolveSlots([{ key: 'a', label: 'a', slot: Number.NaN }])).toEqual(['1']);
  });

  it('should ignore the slot of a neutral series', () => {
    expect(resolveSlots([{ key: 'o', label: 'o', tone: 'neutral', slot: 3 }, ...plain('a')])).toEqual(['neutral', '1']);
  });

  it('should cycle every slot when all eight are pinned and an unpinned series remains', () => {
    const pinned = Array.from({ length: 8 }, (_, i) => ({ key: `p${i}`, label: 'p', slot: i + 1 }));
    expect(resolveSlots([...pinned, ...plain('a')]).at(-1)).toBe('1');
  });

  it('should reuse the free slots once more than eight series are unpinned', () => {
    expect(resolveSlots(plain(...'abcdefghi'.split(''))).at(-1)).toBe('1');
  });
});

describe('Chart', () => {
  it('should render the empty state when there is no data', () => {
    render(<Chart type="bar" data={[]} series={SERIES} aria-label="Daily cost" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Daily cost' })).not.toBeInTheDocument();
  });

  it('should render a custom empty state', () => {
    render(<Chart type="line" data={DATA} series={[]} aria-label="Daily cost" emptyState={<p>Nothing yet</p>} />);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('should label the plot as an image and ship a data table with every value and total', () => {
    render(<Chart type="bar" stacked data={DATA} series={SERIES} aria-label="Daily cost" formatValue={value => `$${value.toFixed(2)}`} />);
    expect(screen.getByRole('img', { name: 'Daily cost' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Daily cost' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(cell => cell.textContent),
    ).toEqual(['Novel Forge', 'Memoir', 'Other', 'Total']);
    const tuesday = within(table).getByRole('rowheader', { name: 'Tue' }).closest('tr')!;
    expect(
      within(tuesday)
        .getAllByRole('cell')
        .map(cell => cell.textContent),
    ).toEqual(['$6.00', '$1.50', '$0.00', '$7.50']);
  });

  it('should keep y-axis ticks compact when only formatValue is given', () => {
    const data = [{ x: 'Mon', values: { forge: 1800 } }];
    render(<Chart type="bar" data={data} series={[SERIES[0]!]} aria-label="Daily cost" formatValue={value => `$${value.toFixed(2)}`} />);
    expect(screen.getAllByText('2K').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('$2000.00')).toHaveLength(0);
    expect(within(screen.getByRole('table')).getByText('$1800.00')).toBeInTheDocument();
  });

  it('should format y-axis ticks with a custom formatTick', () => {
    const data = [{ x: 'Mon', values: { forge: 1800 } }];
    render(<Chart type="bar" data={data} series={[SERIES[0]!]} aria-label="Daily cost" formatTick={value => `${value / 1000}k units`} />);
    expect(screen.getAllByText('2k units').length).toBeGreaterThan(0);
  });

  it('should hide the legend and total for a single series', () => {
    render(<Chart type="line" data={DATA} series={[SERIES[0]!]} aria-label="Daily cost" />);
    expect(within(screen.getByRole('table')).queryByText('Total')).not.toBeInTheDocument();
    expect(document.querySelector('ul')).toBeNull();
  });

  it('should make one column a tab stop and move between columns with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Chart type="area" stacked data={DATA} series={SERIES} aria-label="Daily cost" />);
    const columns = within(screen.getByRole('group', { name: 'Daily cost, data points' })).getAllByRole('img');
    expect(columns.map(column => column.tabIndex)).toEqual([0, -1, -1]);
    await user.tab();
    expect(columns[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(columns[2]).toHaveFocus();
    expect(columns[2]).toHaveAccessibleName('Wed: Novel Forge 3, Memoir 4, Other 2, Total 9');
  });

  it('should show every series value and the total in a tooltip on focus and dismiss it with Escape', async () => {
    const user = userEvent.setup();
    render(<Chart type="bar" data={DATA} series={SERIES} aria-label="Daily cost" />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    const tooltip = document.querySelector<HTMLElement>('[data-side]')!;
    expect(tooltip).not.toBeNull();
    expect(tooltip).toHaveTextContent('Tue');
    expect(
      within(tooltip)
        .getAllByRole('definition', { hidden: true })
        .map(cell => cell.textContent),
    ).toEqual(['6', '1.5', '0', '7.5']);
    await user.keyboard('{Escape}');
    expect(document.querySelector('[data-side]')).toBeNull();
  });

  it('should paint a pinned series with its slot whatever its position', () => {
    const { container } = render(<Chart type="bar" data={DATA} series={[{ key: 'memoir', label: 'Memoir', slot: 4 }]} aria-label="Daily cost" />);
    expect(container.querySelector('[data-slot="4"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="1"]')).toBeNull();
  });
});
