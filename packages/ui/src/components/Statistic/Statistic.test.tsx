/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Statistic } from './Statistic';

/**
 * Declaring the constants
 */

describe('Statistic', () => {
  it('formats the raw value and renders the label', () => {
    render(<Statistic label="Requests" value={2412806} locale="en-US" format={{ notation: 'compact' }} />);
    expect(screen.getByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('2.4M')).toBeInTheDocument();
  });

  it('never infers sentiment from direction — a rising bad metric is danger', () => {
    render(<Statistic label="Error rate" value={0.42} unit="%" delta={0.12} positiveIs="down" comparison="vs last week" />);
    const delta = screen.getByText('12%');
    expect(delta.closest('[data-sentiment]')).toHaveAttribute('data-sentiment', 'bad');
  });

  it('marks an improving metric good', () => {
    render(<Statistic label="Signups" value={1200} delta={0.08} positiveIs="up" comparison="vs last week" />);
    expect(screen.getByText('8%').closest('[data-sentiment]')).toHaveAttribute('data-sentiment', 'good');
  });

  it('builds one coherent accessible sentence with sentiment in words', () => {
    render(<Statistic label="Error rate" value={0.42} unit="%" delta={-0.08} positiveIs="down" comparison="last week" />);
    expect(screen.getByText(/Error rate: 0.42 %, down 8% versus last week, improving/)).toBeInTheDocument();
  });

  it('renders as a link and activates when interactive', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Statistic label="Latency" value={412} unit="ms" onClick={onClick} />);
    const target = screen.getByRole('button', { name: /Latency: 412 ms/ });
    await user.click(target);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
