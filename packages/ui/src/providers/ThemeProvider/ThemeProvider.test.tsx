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

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/`;
}

function readCookie(name: string): string | null {
  return document.cookie.match(`(?:^|; )${name}=([^;]*)`)?.[1] ?? null;
}

function Probe() {
  const { theme, mode, setMode, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
      <button type="button" onClick={() => setMode('system')}>
        system
      </button>
    </div>
  );
}

beforeEach(() => vi.stubGlobal('localStorage', makeStorage()));

afterEach(() => {
  vi.unstubAllGlobals();
  for (const entry of document.cookie.split('; ')) document.cookie = `${entry.split('=')[0]}=; path=/; max-age=0`;
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
});

describe('ThemeProvider', () => {
  it('should server-render the deterministic default theme without touching the DOM', () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(html).toContain('>light<');
  });

  it('should adopt the theme persisted in the shared cookie and apply it to <html>', async () => {
    setCookie('shadow-theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should fall back to the legacy localStorage key when no cookie is set', async () => {
    localStorage.setItem('webnovel-theme', 'dark');
    render(
      <ThemeProvider legacyStorageKey="webnovel-theme">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark'));
  });

  it('should promote a legacy theme into the shared cookie so the other apps pick it up', async () => {
    localStorage.setItem('webnovel-theme', 'dark');
    render(
      <ThemeProvider legacyStorageKey="webnovel-theme">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(readCookie('shadow-theme')).toBe('dark'));
  });

  it('should not promote an OS-derived theme, so it keeps tracking the OS', async () => {
    render(
      <ThemeProvider legacyStorageKey="webnovel-theme">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent(/light|dark/));
    expect(readCookie('shadow-theme')).toBeNull();
  });

  it('should prefer the cookie over the legacy localStorage key', async () => {
    setCookie('shadow-theme', 'light');
    localStorage.setItem('webnovel-theme', 'dark');
    render(
      <ThemeProvider legacyStorageKey="webnovel-theme">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'));
  });

  it('should persist a toggled theme to the cookie and leave the legacy key alone', async () => {
    setCookie('shadow-theme', 'light');
    const user = userEvent.setup();
    render(
      <ThemeProvider legacyStorageKey="webnovel-theme">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'));
    await user.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(readCookie('shadow-theme')).toBe('dark');
    expect(localStorage.getItem('webnovel-theme')).toBeNull();
  });

  it('should report mode `system` when nothing is persisted, and the explicit choice once one is', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('system'));

    await userEvent.setup().click(screen.getByText('toggle'));
    expect(screen.getByTestId('mode')).toHaveTextContent(/light|dark/);
    expect(readCookie('shadow-theme')).toBe(screen.getByTestId('theme').textContent);
  });

  it('should clear the shared cookie when the mode goes back to `system`', async () => {
    setCookie('shadow-theme', 'dark');
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('dark'));

    await user.click(screen.getByText('system'));
    expect(screen.getByTestId('mode')).toHaveTextContent('system');
    expect(readCookie('shadow-theme')).toBeNull();
  });

  it('should re-read the cookie when the page becomes visible, so a switch in a sibling app lands', async () => {
    setCookie('shadow-theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'));

    setCookie('shadow-theme', 'dark');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark'));
  });
});

describe('themeInitScript', () => {
  it('should read the shared cookie and fall back to the OS preference', () => {
    const script = themeInitScript();
    expect(script).toContain('shadow-theme');
    expect(script).toContain('document.cookie');
    expect(script).toContain('prefers-color-scheme: dark');
    expect(script).toContain('data-theme');
  });

  it('should read the legacy storage key only when one is given', () => {
    expect(themeInitScript()).not.toContain('localStorage');
    expect(themeInitScript({ legacyStorageKey: 'custom-key' })).toContain("localStorage.getItem('custom-key')");
  });

  /** The script is what runs pre-paint, so asserting on its text is not enough — execute it and read the DOM. */
  it('should apply the cookie theme to <html> when executed', () => {
    setCookie('shadow-theme', 'dark');
    new Function(themeInitScript())();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should apply the legacy storage theme when executed with no cookie present', () => {
    localStorage.setItem('webnovel-theme', 'dark');
    new Function(themeInitScript({ legacyStorageKey: 'webnovel-theme' }))();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should reject a key that could break out of the generated script', () => {
    expect(() => themeInitScript({ cookieName: "x');alert(1);//" })).toThrow(/Invalid theme storage key/);
    expect(() => themeInitScript({ legacyStorageKey: "x');alert(1);//" })).toThrow(/Invalid theme storage key/);
  });
});

/**
 * `document.cookie` never reads back the attributes a write carried, so the scope a cookie was written
 * for is only observable by intercepting the write itself.
 */
function cookieDescriptor(): PropertyDescriptor {
  for (let target: object | null = document; target; target = Object.getPrototypeOf(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'cookie');
    if (descriptor?.get && descriptor.set) return descriptor;
  }
  throw new Error('no `document.cookie` accessor to wrap');
}

function captureCookieWrites(): string[] {
  const writes: string[] = [];
  const descriptor = cookieDescriptor();
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => descriptor.get?.call(document),
    set: (value: string) => {
      writes.push(value);
      descriptor.set?.call(document, value);
    },
  });
  return writes;
}

function atHost(hostname: string): void {
  vi.spyOn(window.location, 'hostname', 'get').mockReturnValue(hostname);
}

describe('ThemeProvider cookie scope', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'cookie');
    vi.restoreAllMocks();
  });

  it('should widen the cookie to the registrable parent so sibling apps share it', async () => {
    atHost('identity.shadow-apps.test');
    const writes = captureCookieWrites();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByText('toggle'));

    expect(writes.some(write => write.includes('shadow-theme=dark') && write.includes('domain=.shadow-apps.test'))).toBe(true);
  });

  it('should clear the host-only twin an earlier build left behind, which would otherwise shadow the shared cookie', async () => {
    atHost('identity.shadow-apps.test');
    const writes = captureCookieWrites();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByText('toggle'));

    const erase = writes.findIndex(write => write.includes('shadow-theme=;') && !write.includes('domain='));
    const widen = writes.findIndex(write => write.includes('domain=.shadow-apps.test'));
    expect(erase).toBeGreaterThanOrEqual(0);
    expect(erase).toBeLessThan(widen);
  });

  it('should stay host-only on a single-label host, where there is no parent to widen to', async () => {
    atHost('localhost');
    const writes = captureCookieWrites();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByText('toggle'));

    expect(writes.every(write => !write.includes('domain='))).toBe(true);
  });

  it('should stay host-only on a bare registrable domain, whose parent is a public suffix', async () => {
    atHost('shadow-apps.test');
    const writes = captureCookieWrites();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByText('toggle'));

    expect(writes.every(write => !write.includes('domain='))).toBe(true);
  });

  it('should stay host-only on an IP literal', async () => {
    atHost('127.0.0.1');
    const writes = captureCookieWrites();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByText('toggle'));

    expect(writes.every(write => !write.includes('domain='))).toBe(true);
  });

  it('should honour an explicit cookieDomain over the derived one', async () => {
    atHost('identity.shadow-apps.test');
    const writes = captureCookieWrites();
    render(
      <ThemeProvider cookieDomain=".override.test">
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByText('toggle'));

    expect(writes.some(write => write.includes('domain=.override.test'))).toBe(true);
    expect(writes.every(write => !write.includes('domain=.shadow-apps.test'))).toBe(true);
  });

  it('should erase both scopes when the mode goes back to system, so no stale twin survives', async () => {
    atHost('identity.shadow-apps.test');
    const writes = captureCookieWrites();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'system' }));

    const erases = writes.filter(write => write.includes('shadow-theme=;') || write.includes('max-age=0'));
    expect(erases.some(write => write.includes('domain=.shadow-apps.test'))).toBe(true);
    expect(erases.some(write => !write.includes('domain='))).toBe(true);
  });
});
