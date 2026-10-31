import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Breadcrumbs } from './Breadcrumbs';

const css = readFileSync(path.join(import.meta.dirname, 'Breadcrumbs.module.css'), 'utf-8');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('Breadcrumbs', () => {
  it('renders the WAI-ARIA breadcrumb structure', () => {
    render(
      <Breadcrumbs>
        <Breadcrumbs.Item href="/workspaces">Workspaces</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/workspaces/acme">acme-prod</Breadcrumbs.Item>
        <Breadcrumbs.Item current>checkout-service</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute('href', '/workspaces');
    const current = screen.getByText('checkout-service');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).toBe('SPAN');
  });

  it('collapses the middle into an overflow menu past maxVisible', async () => {
    const user = userEvent.setup();
    render(
      <Breadcrumbs maxVisible={4}>
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/b">Bravo</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/c">Charlie</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/d">Delta</Breadcrumbs.Item>
        <Breadcrumbs.Item current>Echo</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delta' })).toBeInTheDocument();
    expect(screen.getByText('Echo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bravo' })).not.toBeInTheDocument();

    const overflow = screen.getByRole('button', { name: 'Show 2 hidden levels' });
    await user.click(overflow);
    expect(screen.getByRole('link', { name: 'Bravo' })).toHaveAttribute('href', '/b');
    expect(screen.getByRole('link', { name: 'Charlie' })).toBeInTheDocument();
  });

  it('keeps asChild router links intact when they collapse into the overflow', async () => {
    const user = userEvent.setup();
    render(
      <Breadcrumbs maxVisible={4}>
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item asChild>
          <a href="/b">Bravo</a>
        </Breadcrumbs.Item>
        <Breadcrumbs.Item href="/c">Charlie</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/d">Delta</Breadcrumbs.Item>
        <Breadcrumbs.Item current>Echo</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    await user.click(screen.getByRole('button', { name: 'Show 2 hidden levels' }));
    // Rebuilding the anchor from crumb.props.href dropped the href for asChild crumbs, taking the link
    // role with it.
    expect(screen.getByRole('link', { name: 'Bravo' })).toHaveAttribute('href', '/b');
  });

  it('does not collapse at or under maxVisible', () => {
    render(
      <Breadcrumbs maxVisible={4}>
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/b">Bravo</Breadcrumbs.Item>
        <Breadcrumbs.Item current>Charlie</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.queryByRole('button', { name: /hidden levels/ })).not.toBeInTheDocument();
  });

  it('should ellipsise link and current labels from a block box, since text-overflow is inert on inline-flex', () => {
    const body = ruleBody('.link,\n.current');
    expect(body).toMatch(/display: block;/);
    expect(body).toMatch(/min-width: 0;/);
    expect(body).toMatch(/overflow: hidden;/);
    expect(body).toMatch(/text-overflow: ellipsis;/);
  });

  it('should shrink ancestors before the current crumb', () => {
    expect(ruleBody('.crumb')).toMatch(/min-width: 0;/);
    expect(ruleBody('.crumb:last-child')).toMatch(/flex-shrink: 0;/);
    expect(ruleBody('.crumb:last-child')).toMatch(/max-width: 100%;/);
  });

  it('should leave the responsive collapse off by default', () => {
    render(
      <Breadcrumbs>
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item current>Bravo</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).not.toHaveAttribute('data-hide-ancestors-below');
  });

  it('should mark the breakpoint below which only the current crumb shows', () => {
    render(
      <Breadcrumbs hideAncestorsBelow="sm">
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item current>Bravo</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveAttribute('data-hide-ancestors-below', 'sm');
    expect(css).toMatch(
      /@media \(max-width: 639px\) \{\s*\.root\[data-hide-ancestors-below='sm'\] \.crumb:not\(:last-child\),\s*\.root\[data-hide-ancestors-below='sm'\] \.crumb:last-child > \.separator \{\s*display: none;/,
    );
  });

  it('should render a single crumb without a separator', () => {
    const { container } = render(
      <Breadcrumbs>
        <Breadcrumbs.Item current>Only</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.getByText('Only')).toHaveAttribute('aria-current', 'page');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('should keep the title and other span attributes on the current crumb', () => {
    render(
      <Breadcrumbs>
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item current title="webnovel-ingest-pipeline-production-worker" data-testid="leaf">
          webnovel-ingest-pipeline-production-worker
        </Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    const current = screen.getByTestId('leaf');
    expect(current.tagName).toBe('SPAN');
    expect(current).toHaveAttribute('title', 'webnovel-ingest-pipeline-production-worker');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('should drop anchor-only attributes from the current crumb', () => {
    render(
      <Breadcrumbs>
        <Breadcrumbs.Item current href="/here" target="_blank" rel="noopener">
          Here
        </Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    const current = screen.getByText('Here');
    expect(current).not.toHaveAttribute('href');
    expect(current).not.toHaveAttribute('target');
    expect(current).not.toHaveAttribute('rel');
  });
});
