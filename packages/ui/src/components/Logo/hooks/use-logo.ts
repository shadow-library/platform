/**
 * Importing npm packages
 */
import { type MantineColorShade, useComputedColorScheme, useMantineTheme } from '@mantine/core';

/**
 * Importing user defined packages
 */
import { type Theme } from '@/types';

/**
 * Defining types
 */

export interface LogoRenderConfig {
  primaryColor: string;
  secondaryColor: string;
  dividerColor: string;
}

/**
 * Declaring the constants
 */
const SECONDARY_COLOR_SHADES: Record<Theme, MantineColorShade> = { dark: 5, light: 4 };

export function useLogo(): LogoRenderConfig {
  const colorScheme = useComputedColorScheme();
  const theme = useMantineTheme();

  const primaryShade = typeof theme.primaryShade === 'object' ? theme.primaryShade[colorScheme] : theme.primaryShade;
  const primaryColor = theme.colors[theme.primaryColor]?.[primaryShade] as string;
  const secondaryColor = theme.colors.slate?.[SECONDARY_COLOR_SHADES[colorScheme]] as string;
  const dividerColor = theme.colors.terracotta[4];

  return { primaryColor, secondaryColor, dividerColor };
}
