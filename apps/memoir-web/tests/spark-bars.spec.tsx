import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SparkBars } from '@/components/SparkBars';

function bars(label: string): HTMLElement[] {
  return [...screen.getByRole('img', { name: label }).children] as HTMLElement[];
}

describe('SparkBars', () => {
  it('should scale bars to the data range', () => {
    render(<SparkBars values={[79.9, 79.2, 78.5]} label="Weight trend" domain="range" />);
    const [highest, middle, lowest] = bars('Weight trend').map(bar => parseFloat(bar.style.height));

    expect(highest).toBe(100);
    expect(lowest).toBeLessThan(25);
    expect(middle).toBeGreaterThan(lowest as number);
    expect(middle).toBeLessThan(highest as number);
  });

  it('should measure bars from zero by default', () => {
    render(<SparkBars values={[80, 40]} label="Calories" />);
    expect(bars('Calories').map(bar => bar.style.height)).toEqual(['100%', '50%']);
  });

  it('should leave blank days empty', () => {
    render(<SparkBars values={[3, null, 5]} label="Mood over the month" domain={{ min: 0, max: 5 }} />);
    const [logged, blank, bright] = bars('Mood over the month');

    expect(blank?.style.height).toBe('0%');
    expect(logged?.style.height).toBe('60%');
    expect(bright?.style.height).toBe('100%');
  });

  it('should space bars by date when dates are given', () => {
    render(<SparkBars values={[79, 78.8, 78.5]} dates={['2026-08-01', '2026-08-02', '2026-08-10']} label="Weight trend" domain="range" />);
    expect(bars('Weight trend').map(bar => bar.style.left)).toEqual(['0%', '10%', '90%']);
  });

  it('should label the scale and the axis', () => {
    render(<SparkBars values={[2, 4]} label="Mood over the month" scale={{ top: 'Bright', bottom: 'Low' }} axis={{ start: '26 Jul', end: 'Today' }} />);

    expect(screen.getByText('Bright')).toBeDefined();
    expect(screen.getByText('Low')).toBeDefined();
    expect(screen.getByText('26 Jul')).toBeDefined();
    expect(screen.getByText('Today')).toBeDefined();
  });
});
