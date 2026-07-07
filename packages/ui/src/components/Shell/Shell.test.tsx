/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Page, Shell } from './Shell';

/**
 * Declaring the constants
 */

describe('Shell', () => {
  it('renders sidebar, topbar, and a main landmark with a skip link first', () => {
    render(
      <Shell sidebar={<nav aria-label='Main'>nav</nav>} topbar={<header>bar</header>}>
        <div>content</div>
      </Shell>,
    );
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#sh-main-content');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'sh-main-content');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('mounts dark theme and compact density on the root', () => {
    const { container } = render(<Shell theme='dark' density='compact' />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('dark');
    expect(root).toHaveAttribute('data-density', 'compact');
  });
});

describe('Page', () => {
  it('renders the header with title, description, and actions', () => {
    render(
      <Page title='Services' description='Everything running in acme-prod' actions={<button type='button'>New service</button>}>
        <div>page body</div>
      </Page>,
    );
    expect(screen.getByRole('heading', { name: 'Services', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Everything running in acme-prod')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New service' })).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('omits the header when there is nothing to show', () => {
    render(<Page>just content</Page>);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByText('just content')).toBeInTheDocument();
  });
});
