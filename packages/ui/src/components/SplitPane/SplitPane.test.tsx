/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { SplitPane } from './SplitPane';

/**
 * Declaring the constants
 */
function Workspace({ collapsible = false }: { collapsible?: boolean }) {
  return (
    <SplitPane direction='horizontal'>
      <SplitPane.Pane defaultSize='30%' minSize={100} collapsible={collapsible} collapseLabel='Explorer'>
        <div>Explorer content</div>
      </SplitPane.Pane>
      <SplitPane.Handle aria-label='Resize explorer' />
      <SplitPane.Pane minSize={200}>
        <div>Editor content</div>
      </SplitPane.Pane>
    </SplitPane>
  );
}

describe('SplitPane', () => {
  it('renders both panes and a window-splitter handle', () => {
    render(<Workspace />);
    expect(screen.getByText('Explorer content')).toBeInTheDocument();
    expect(screen.getByText('Editor content')).toBeInTheDocument();
    const handle = screen.getByRole('separator', { name: 'Resize explorer' });
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('collapses a collapsible pane from the keyboard and restores from the rail', async () => {
    const user = userEvent.setup();
    render(<Workspace collapsible />);
    const handle = screen.getByRole('separator', { name: 'Resize explorer' });
    handle.focus();
    await user.keyboard('{Enter}');
    const rail = await screen.findByRole('button', { name: 'Explorer' });
    expect(screen.queryByText('Explorer content')).not.toBeVisible();
    await user.click(rail);
    expect(screen.getByText('Explorer content')).toBeVisible();
  });

  it('does not collapse a non-collapsible pane on Enter', async () => {
    const user = userEvent.setup();
    render(<Workspace collapsible={false} />);
    screen.getByRole('separator', { name: 'Resize explorer' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'Explorer' })).not.toBeInTheDocument();
  });
});
