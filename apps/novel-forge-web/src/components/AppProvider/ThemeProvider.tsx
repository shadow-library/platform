/**
 * Importing npm packages
 */
import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Declaring types
 */
export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export interface ThemeProviderProps {
  children?: React.ReactNode;
}

/**
 * Declaring constants
 */
const THEME_STORAGE_KEY = 'theme';
const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', setTheme: () => {}, toggleTheme: () => {} });

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Shadow UI is themed purely through `data-theme` (and the `dark` class) on the
 * document root — there is no provider to mount. This keeps the user's choice in
 * sync with the DOM attribute the design tokens key off, plus localStorage and
 * the OS preference.
 */
export default function ThemeProvider(props: ThemeProviderProps): React.JSX.Element {
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
