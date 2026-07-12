/**
 * Importing npm packages
 */
import { type PropsWithChildren, createContext, useContext, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import { type Theme } from '@/types';

/**
 * Defining types
 */
export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Declaring the constants
 */
const THEME_STORAGE_KEY = 'shadow-identity-theme';
const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', setTheme: () => undefined, toggleTheme: () => undefined });

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Shadow UI is themed purely through `data-theme` (and the `dark` class) on the document root — there
 * is no provider to mount. This keeps the user's choice in sync with the DOM attribute the design
 * tokens key off, plus localStorage and the OS preference.
 */
export default function ThemeProvider(props: PropsWithChildren): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setThemeState = (next: Theme): void => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setTheme(next);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = (): void => setThemeState(theme === 'dark' ? 'light' : 'dark');

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState, toggleTheme }}>{props.children}</ThemeContext.Provider>;
}
