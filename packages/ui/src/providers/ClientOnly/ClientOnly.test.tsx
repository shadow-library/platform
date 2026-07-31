/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { ClientOnly } from './ClientOnly';

/**
 * Declaring the constants
 */

describe('ClientOnly', () => {
  it('renders its children once mounted in the browser', () => {
    render(
      <ClientOnly>
        <span>client-only</span>
      </ClientOnly>,
    );
    expect(screen.getByText('client-only')).toBeInTheDocument();
  });

  it('renders nothing (or the fallback) on the server', () => {
    expect(renderToStaticMarkup(<ClientOnly>child</ClientOnly>)).toBe('');
    expect(renderToStaticMarkup(<ClientOnly fallback={<span>ssr</span>}>child</ClientOnly>)).toContain('ssr');
  });
});
