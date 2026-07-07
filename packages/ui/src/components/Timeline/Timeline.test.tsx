/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Timeline } from './Timeline';

/**
 * Declaring the constants
 */

describe('Timeline', () => {
  it('renders an ordered list of entries', () => {
    render(
      <Timeline aria-label='Activity'>
        <Timeline.Item status='completed' title='Order shipped' timestamp='2h ago' />
        <Timeline.Item status='current' title='In transit' />
      </Timeline>,
    );
    expect(screen.getByRole('list', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Order shipped')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('joins the status to the entry text as a visually-hidden prefix', () => {
    render(
      <Timeline>
        <Timeline.Item status='danger' title='Job failed' />
      </Timeline>,
    );
    expect(screen.getByText('Failed:')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveAttribute('data-status', 'danger');
  });

  it('does not add a status prefix for default events', () => {
    render(
      <Timeline>
        <Timeline.Item status='default' title='Comment added' />
      </Timeline>,
    );
    expect(screen.queryByText(/:/)).not.toBeInTheDocument();
    expect(screen.getByText('Comment added')).toBeInTheDocument();
  });
});
