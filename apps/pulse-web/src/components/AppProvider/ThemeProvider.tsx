/**
 * Importing npm packages
 */
import { ConfigProvider, type ThemeConfig } from 'antd';
import { useContext, createContext, useState, useEffect } from 'react';

/**
 *  Importing user defined modules
 */
import { darkTheme, lightTheme } from '@/constants';

/**
 * Declaring types
 */

export type Theme = 'light' | 'dark';

export interface ThemeContext {
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
const themeConfigs: Record<Theme, ThemeConfig> = { light: lightTheme, dark: darkTheme };
const ThemeContext = createContext<ThemeContext>({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider(props: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setThemeState = (newTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    setTheme(newTheme);
  };

  useEffect(() => document.documentElement.setAttribute('data-theme', theme), [theme]);
  const toggleTheme = () => setThemeState(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, toggleTheme }}>
      <ConfigProvider theme={themeConfigs[theme]}>{props.children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}
