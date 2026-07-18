/**
 * Importing npm packages
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { themeInitScript, ThemeProvider, useTheme } from './ThemeProvider';

/**
 * Declaring the constants
 */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: key => void map.delete(key),
    clear: () => map.clear(),
    key: index => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

beforeEach(() => vi.stubGlobal('localStorage', makeStorage()));

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
});

describe('ThemeProvider', () => {
  it('server-renders the deterministic default theme without touching the DOM', () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(html).toContain('>light<');
  });

  it('adopts the persisted theme after mount and applies it to <html>', async () => {
    localStorage.setItem('shadow-theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles the theme and persists the choice', async () => {
    localStorage.setItem('shadow-theme', 'light');
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'));
    await user.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(localStorage.getItem('shadow-theme')).toBe('dark');
  });

  it('emits a self-contained init script keyed to the storage key', () => {
    const script = themeInitScript('custom-key');
    expect(script).toContain('custom-key');
    expect(script).toContain('prefers-color-scheme: dark');
    expect(script).toContain('data-theme');
  });
});
