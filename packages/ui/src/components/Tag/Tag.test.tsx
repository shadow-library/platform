/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Tag } from './Tag';

/**
 * Declaring the constants
 */

describe('Tag', () => {
  it('renders a plain metadata label as a span', () => {
    render(<Tag>design</Tag>);
    const tag = screen.getByText('design');
    expect(tag.tagName).toBe('SPAN');
    expect(tag).toHaveAttribute('data-size', 'md');
  });

  it('renders a remove button labelled from the tag text and fires onRemove', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Tag onRemove={onRemove}>design-system</Tag>);
    await user.click(screen.getByRole('button', { name: 'Remove design-system' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('omits the remove button when onRemove is not provided', () => {
    render(<Tag>static</Tag>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a decorative swatch when color is set', () => {
    const { container } = render(<Tag color="#4F46E5">design-system</Tag>);
    const swatch = container.querySelector('[aria-hidden="true"]');
    expect(swatch).toBeInTheDocument();
    expect(swatch).toHaveStyle({ background: '#4F46E5' });
  });

  it('renders as a link through asChild', () => {
    render(
      <Tag asChild>
        <a href="/topics/infra">infrastructure</a>
      </Tag>,
    );
    const link = screen.getByRole('link', { name: 'infrastructure' });
    expect(link).toHaveAttribute('href', '/topics/infra');
    expect(link).toHaveAttribute('data-interactive', 'true');
  });

  it('applies the size on the root', () => {
    render(<Tag size="lg">backend</Tag>);
    expect(screen.getByText('backend')).toHaveAttribute('data-size', 'lg');
  });
});
