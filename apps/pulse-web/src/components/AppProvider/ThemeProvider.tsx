/**
 * Importing npm packages
 */
import { type PropsWithChildren, createContext, useContext, useEffect, useState } from 'react';

/**
 * Declaring types
 */
export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Declaring constants
 */
const THEME_STORAGE_KEY = 'theme';
const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export default function ThemeProvider(props: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setThemeState = (newTheme: Theme): void => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    setTheme(newTheme);
  };

  // The @shadow-library/ui tokens flip on `data-theme` at the document root.
  useEffect(() => document.documentElement.setAttribute('data-theme', theme), [theme]);

  const toggleTheme = (): void => setThemeState(theme === 'dark' ? 'light' : 'dark');

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState, toggleTheme }}>{props.children}</ThemeContext.Provider>;
}
