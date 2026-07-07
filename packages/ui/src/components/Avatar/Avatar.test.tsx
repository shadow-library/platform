/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Avatar, AvatarGroup } from './Avatar';

/**
 * Declaring the constants
 */

describe('Avatar', () => {
  it('renders initials with an accessible name', () => {
    render(<Avatar name='Maya Kim' />);
    expect(screen.getByRole('img', { name: 'Maya Kim' })).toBeInTheDocument();
    expect(screen.getByText('MK')).toBeInTheDocument();
  });

  it('derives two letters for a single-word name', () => {
    render(<Avatar name='Acme' />);
    expect(screen.getByText('AC')).toBeInTheDocument();
  });

  it('folds presence into the accessible name', () => {
    render(<Avatar name='Ana' presence='online' />);
    expect(screen.getByRole('img', { name: 'Ana, online' })).toBeInTheDocument();
  });

  it('is decorative when alt is empty', () => {
    const { container } = render(<Avatar name='Maya Kim' alt='' />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('reflects shape and size on the root', () => {
    render(<Avatar name='Acme Corp' shape='square' size='lg' />);
    const root = screen.getByRole('img');
    expect(root).toHaveAttribute('data-shape', 'square');
    expect(root).toHaveAttribute('data-size', 'lg');
  });

  it('assigns a stable tint per name', () => {
    const { rerender } = render(<Avatar name='Maya Kim' />);
    const tint = screen.getByRole('img').getAttribute('data-tint');
    rerender(<Avatar name='Maya Kim' />);
    expect(screen.getByRole('img').getAttribute('data-tint')).toBe(tint);
  });
});

describe('AvatarGroup', () => {
  it('shows up to max avatars and collapses the rest into +N', () => {
    render(
      <AvatarGroup max={2}>
        <Avatar name='Aa Aa' />
        <Avatar name='Bb Bb' />
        <Avatar name='Cc Cc' />
        <Avatar name='Dd Dd' />
      </AvatarGroup>,
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByLabelText('2 more')).toBeInTheDocument();
  });

  it('propagates its size to child avatars', () => {
    render(
      <AvatarGroup size='lg'>
        <Avatar name='Aa Aa' />
      </AvatarGroup>,
    );
    expect(screen.getByRole('img', { name: 'Aa Aa' })).toHaveAttribute('data-size', 'lg');
  });
});
